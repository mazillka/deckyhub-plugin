import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import tempfile
import zipfile
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import decky

# Decky loads main.py with importlib; its plugin directory is not guaranteed to be on sys.path.
PLUGIN_DIR = str(Path(__file__).resolve().parent)
if PLUGIN_DIR not in sys.path:
    sys.path.insert(0, PLUGIN_DIR)

from backend.registry import load_registry


DEFAULT_DOWNLOAD_DIR = "/home/deck/Downloads"
DECKYHUB_REPO = "mazillka/deckyhub-plugin"
DECKYHUB_RELEASE_PREFIX = f"https://github.com/{DECKYHUB_REPO}/releases/download/"
REPOSITORY_NAME = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
class Plugin:
    async def _main(self):
        self.settings_path = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "settings.json"
        self.settings = self._load_settings()
        self.apps = load_registry(decky.DECKY_PLUGIN_DIR)
        self.downloads: dict[str, dict] = {}
        self.cancelled: set[str] = set()

    def _load_settings(self) -> dict:
        try:
            settings = json.loads(self.settings_path.read_text(encoding="utf-8"))
            repos = settings.get("customRepos", [])
            return {
                "verifySha256": bool(settings.get("verifySha256", True)),
                "overwriteExisting": bool(settings.get("overwriteExisting", False)),
                "customRepos": [repo for repo in repos if isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo)],
            }
        except (AttributeError, OSError, json.JSONDecodeError):
            return {"verifySha256": True, "overwriteExisting": False, "customRepos": []}

    def _save_settings(self):
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        self.settings_path.write_text(json.dumps(self.settings), encoding="utf-8")

    def _installed_version(self, app: dict) -> str | None:
        rule = app.get("detect", {})
        if rule.get("type") == "decky-plugin":
            return self._decky_plugin_version(rule)
        command = rule.get("command")
        if not command or not shutil.which(command):
            return None
        try:
            result = subprocess.run([command, *rule.get("args", ["--version"])], capture_output=True, text=True, timeout=4, check=False)
            output = (result.stdout + result.stderr).strip()
            return output[:200] or "installed"
        except (OSError, subprocess.SubprocessError):
            return "installed"

    def _decky_plugin_version(self, rule: dict) -> str | None:
        names = {name.casefold() for name in rule.get("names", [])}
        plugins_dir = Path(decky.DECKY_HOME) / "plugins"
        for manifest_path in plugins_dir.glob("*/plugin.json"):
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if manifest.get("name", "").casefold() not in names:
                continue
            if manifest.get("version"):
                return str(manifest["version"])
            try:
                package = json.loads((manifest_path.parent / "package.json").read_text(encoding="utf-8"))
                return str(package.get("version") or "installed")
            except (OSError, json.JSONDecodeError):
                return "installed"
        return None

    async def get_apps(self):
        apps = [*self.apps, *self._custom_apps()]
        installed = await asyncio.gather(*(asyncio.to_thread(self._installed_version, app) for app in apps))
        return {"apps": [{**app, "installedVersion": version, "latestVersion": None, "publishedAt": None, "releaseUrl": None, "assets": [], "updateAvailable": None, "error": None} for app, version in zip(apps, installed)]}

    def _custom_apps(self) -> list[dict]:
        bundled = {app["repo"].casefold() for app in self.apps}
        return [{"id": f"custom-{repo.replace('/', '-')}", "name": repo, "repo": repo, "category": "Custom", "versionStrategy": "semver", "source": "releases", "asset": {"include": [], "exclude": ["source"]}} for repo in self.settings["customRepos"] if repo.casefold() not in bundled]

    async def get_settings(self):
        return self.settings

    async def get_deckyhub_info(self):
        try:
            package = json.loads((Path(PLUGIN_DIR) / "package.json").read_text(encoding="utf-8"))
            return {"version": str(package.get("version", "unknown"))}
        except (OSError, json.JSONDecodeError):
            return {"version": "unknown"}

    async def save_settings(self, settings: dict):
        self.settings = {
            "verifySha256": bool(settings.get("verifySha256", True)),
            "overwriteExisting": bool(settings.get("overwriteExisting", False)),
            "customRepos": getattr(self, "settings", {}).get("customRepos", []),
        }
        self._save_settings()
        return self.settings

    async def add_custom_repo(self, repo: str):
        repo = repo.strip()
        if not REPOSITORY_NAME.fullmatch(repo):
            raise ValueError("Repository must be owner/name")
        existing = {app["repo"].casefold() for app in self.apps} | {item.casefold() for item in self.settings["customRepos"]}
        if repo.casefold() in existing:
            return {"added": False, "repo": repo}
        self.settings["customRepos"].append(repo)
        self._save_settings()
        return {"added": True, "repo": repo}

    async def download_asset(self, asset: dict):
        if not isinstance(asset.get("url"), str) or not asset["url"].startswith("https://"):
            raise ValueError("Only HTTPS release assets can be downloaded")
        name = Path(asset.get("name", "download")).name
        if not name or name in (".", ".."):
            raise ValueError("Invalid asset filename")
        target_dir = Path(DEFAULT_DOWNLOAD_DIR)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / name
        if target.exists() and not self.settings.get("overwriteExisting"):
            target = self._next_name(target)
        job_id = f"{name}-{len(self.downloads) + 1}"
        self.downloads[job_id] = {"state": "queued", "filename": target.name, "received": 0, "total": asset.get("size") or 0, "path": str(target), "error": None}
        asyncio.create_task(asyncio.to_thread(self._download, job_id, asset, target))
        return {"jobId": job_id}

    async def install_deckyhub_update(self, asset: dict):
        return await asyncio.to_thread(self._install_deckyhub_update, asset)

    def _install_deckyhub_update(self, asset: dict):
        url, name = asset.get("url"), Path(str(asset.get("name", ""))).name
        if not isinstance(url, str) or not url.startswith(DECKYHUB_RELEASE_PREFIX) or not name.startswith("DeckyHub-") or not name.endswith(".zip"):
            raise ValueError("Invalid DeckyHub release asset")
        archive = Path(DEFAULT_DOWNLOAD_DIR) / name
        temp = archive.with_name(archive.name + ".part")
        archive.parent.mkdir(parents=True, exist_ok=True)
        job_id = f"deckyhub-update-{len(self.downloads) + 1}"
        self.downloads[job_id] = {"state": "downloading", "filename": name, "received": 0, "total": asset.get("size") or 0, "path": str(archive), "error": None}
        try:
            self._download_with_urllib(job_id, asset, temp)
        except URLError:
            self._download_with_curl(job_id, asset, temp)
        if self.settings.get("verifySha256") and asset.get("sha256") and self._sha256(temp) != asset["sha256"].lower():
            temp.unlink(missing_ok=True)
            raise RuntimeError("SHA256 verification failed")
        os.replace(temp, archive)
        staging = Path(tempfile.mkdtemp(prefix="deckyhub-update-", dir=Path(PLUGIN_DIR).parent))
        try:
            with zipfile.ZipFile(archive) as bundle:
                files = [entry for entry in bundle.infolist() if not entry.is_dir()]
                if not files or sum(entry.file_size for entry in files) > 30 * 1024 * 1024:
                    raise ValueError("Invalid DeckyHub update archive")
                for entry in files:
                    parts = Path(entry.filename).parts
                    if len(parts) < 2 or parts[0] != "DeckyHub" or ".." in parts or Path(entry.filename).is_absolute():
                        raise ValueError("Unsafe DeckyHub update archive")
                    target = staging.joinpath(*parts[1:])
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(entry) as source, open(target, "wb") as destination:
                        shutil.copyfileobj(source, destination)
            required = ("main.py", "package.json", "plugin.json", "dist/index.js", "registry/apps.json")
            if any(not (staging / path).is_file() for path in required):
                raise ValueError("Incomplete DeckyHub update archive")
            version = json.loads((staging / "package.json").read_text(encoding="utf-8")).get("version", "unknown")
            for source in staging.rglob("*"):
                if source.is_file():
                    target = Path(PLUGIN_DIR) / source.relative_to(staging)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(source, target)
            self.downloads[job_id]["state"] = "complete"
            return {"version": str(version), "path": str(archive), "reloadRequired": True}
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def _next_name(self, target: Path) -> Path:
        for number in range(1, 1000):
            candidate = target.with_name(f"{target.stem} ({number}){target.suffix}")
            if not candidate.exists():
                return candidate
        raise RuntimeError("Too many files with this name")

    def _download(self, job_id: str, asset: dict, target: Path):
        job, temp = self.downloads[job_id], target.with_name(target.name + ".part")
        try:
            job["state"] = "downloading"
            self._download_with_urllib(job_id, asset, temp)
        except InterruptedError:
            job["state"] = "cancelled"
            temp.unlink(missing_ok=True)
            self.cancelled.discard(job_id)
            return
        except URLError:
            try:
                self._download_with_curl(job_id, asset, temp)
            except InterruptedError:
                job["state"] = "cancelled"
                temp.unlink(missing_ok=True)
                self.cancelled.discard(job_id)
                return
            except Exception as error:
                job.update({"state": "error", "error": str(error)})
                temp.unlink(missing_ok=True)
                self.cancelled.discard(job_id)
                return
        except Exception as error:
            job.update({"state": "error", "error": str(error)})
            temp.unlink(missing_ok=True)
            self.cancelled.discard(job_id)
            return
        try:
            if self.settings.get("verifySha256") and asset.get("sha256") and self._sha256(temp) != asset["sha256"].lower():
                raise RuntimeError("SHA256 verification failed")
            os.replace(temp, target)
            job["state"] = "complete"
        except Exception as error:
            job.update({"state": "error", "error": str(error)})
            temp.unlink(missing_ok=True)
        finally:
            self.cancelled.discard(job_id)

    def _download_with_urllib(self, job_id: str, asset: dict, temp: Path):
        job = self.downloads[job_id]
        request = Request(asset["url"], headers={"User-Agent": "DeckyHub/0.2"})
        with urlopen(request, timeout=30) as response, open(temp, "wb") as file:
            job["total"] = int(response.headers.get("Content-Length") or job["total"] or 0)
            while chunk := response.read(1024 * 1024):
                if job_id in self.cancelled:
                    raise InterruptedError("Download cancelled")
                file.write(chunk)
                job["received"] += len(chunk)

    def _download_with_curl(self, job_id: str, asset: dict, temp: Path):
        job = self.downloads[job_id]
        process = subprocess.Popen(["curl", "--fail", "--location", "--silent", "--show-error", "--output", str(temp), asset["url"]], stderr=subprocess.PIPE, text=True)
        while process.poll() is None:
            if job_id in self.cancelled:
                process.terminate()
                raise InterruptedError("Download cancelled")
            job["received"] = temp.stat().st_size if temp.exists() else 0
            time.sleep(0.2)
        if process.returncode:
            raise RuntimeError((process.stderr.read() or "curl download failed").strip())
        job["received"] = temp.stat().st_size

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    async def get_download(self, job_id: str):
        return self.downloads.get(job_id, {"state": "missing"})

    async def cancel_download(self, job_id: str):
        self.cancelled.add(job_id)
        return {"ok": True}
