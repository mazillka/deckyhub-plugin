import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import re
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import decky

# Decky loads main.py with importlib; its plugin directory is not guaranteed to be on sys.path.
PLUGIN_DIR = str(Path(__file__).resolve().parent)
if PLUGIN_DIR not in sys.path:
    sys.path.insert(0, PLUGIN_DIR)

from backend.registry import load_registry, parse_registry

DEFAULT_DOWNLOAD_DIR = "/home/deck/Downloads"
PLUGIN_DOWNLOAD_DIR = f"{DEFAULT_DOWNLOAD_DIR}/plugins"
DECKYHUB_REPO = "mazillka/deckyhub-plugin"
DECKYHUB_RELEASE_PREFIX = f"https://github.com/{DECKYHUB_REPO}/releases/download/"
DECKYHUB_VERSION = "0.3.27"
REGISTRY_URL = f"https://raw.githubusercontent.com/{DECKYHUB_REPO}/main/registry/apps.json"
REPOSITORY_NAME = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
SUPPORTED_LANGUAGES = {"auto", "en", "uk", "es", "de", "fr", "ja", "zh"}
class Plugin:
    async def _main(self):
        self.settings_path = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "settings.json"
        self.settings = self._load_settings()
        self.registry_path = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "registry.json"
        self.apps = self._load_registry()
        self.downloads: dict[str, dict] = {}
        self.cancelled: set[str] = set()
        self.download_queue: asyncio.Queue = asyncio.Queue()
        self.queue_worker = asyncio.create_task(self._run_download_queue())

    def _load_settings(self) -> dict:
        try:
            settings = json.loads(self.settings_path.read_text(encoding="utf-8"))
            repos = settings.get("customRepos", [])
            return {
                "verifySha256": bool(settings.get("verifySha256", True)),
                "overwriteExisting": bool(settings.get("overwriteExisting", True)),
                "downloadLocation": "downloads" if settings.get("downloadLocation") == "downloads" else "plugins",
                "updateChannel": "prerelease" if settings.get("updateChannel") == "prerelease" else "stable",
                "language": settings.get("language") if settings.get("language") in SUPPORTED_LANGUAGES else "auto",
                "customRepos": [repo for repo in repos if isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo)],
                "repoSettings": settings.get("repoSettings", {}) if isinstance(settings.get("repoSettings"), dict) else {},
            }
        except (AttributeError, OSError, json.JSONDecodeError):
            return {"verifySha256": True, "overwriteExisting": True, "downloadLocation": "plugins", "updateChannel": "stable", "language": "auto", "customRepos": [], "repoSettings": {}}

    def _load_registry(self) -> list[dict]:
        try:
            return parse_registry(json.loads(self.registry_path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, ValueError):
            return load_registry(decky.DECKY_PLUGIN_DIR)

    def _save_settings(self):
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        self.settings_path.write_text(json.dumps(self.settings), encoding="utf-8")

    def _scan_installed_plugins(self) -> list[tuple[Path, dict, str | None]]:
        plugins_dir = Path(decky.DECKY_HOME) / "plugins"
        scanned = []
        for manifest_path in plugins_dir.glob("*/plugin.json"):
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            scanned.append((manifest_path, manifest, self._plugin_repository(manifest_path, manifest)))
        return scanned

    def _installed_version(self, app: dict, installed_plugins: list[tuple[Path, dict, str | None]]) -> str | None:
        rule = app.get("detect", {})
        if rule.get("type") == "decky-plugin":
            return self._decky_plugin_version(rule, installed_plugins)
        command = rule.get("command")
        if not command or not shutil.which(command):
            return None
        try:
            result = subprocess.run([command, *rule.get("args", ["--version"])], capture_output=True, text=True, timeout=4, check=False)
            output = (result.stdout + result.stderr).strip()
            return output[:200] or "installed"
        except (OSError, subprocess.SubprocessError):
            return "installed"

    def _decky_plugin_version(self, rule: dict, installed_plugins: list[tuple[Path, dict, str | None]]) -> str | None:
        names = {name.casefold() for name in rule.get("names", [])}
        expected_repo = str(rule.get("repo", "")).casefold()
        for manifest_path, manifest, repo in installed_plugins:
            if manifest.get("name", "").casefold() not in names and (not expected_repo or repo != expected_repo):
                continue
            if manifest.get("version"):
                return str(manifest["version"])
            try:
                package = json.loads((manifest_path.parent / "package.json").read_text(encoding="utf-8"))
                return str(package.get("version") or "installed")
            except (OSError, json.JSONDecodeError):
                return "installed"
        return None

    def _plugin_repository(self, manifest_path: Path, manifest: dict) -> str | None:
        try:
            package = json.loads((manifest_path.parent / "package.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            package = {}
        value = package.get("repository", manifest.get("repository"))
        if isinstance(value, dict):
            value = value.get("url")
        if not isinstance(value, str):
            return None
        match = re.search(r"(?:github\.com[/:]|github:)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)", value)
        repo = (match.group(1) if match else value).removesuffix(".git")
        return repo.casefold() if REPOSITORY_NAME.fullmatch(repo) else None

    async def get_apps(self):
        apps = [*self.apps, *self._custom_apps()]
        installed_plugins = await asyncio.to_thread(self._scan_installed_plugins)
        installed = await asyncio.gather(*(asyncio.to_thread(self._installed_version, app, installed_plugins) for app in apps))
        return {"apps": [{**app, "installedVersion": version, "latestVersion": None, "publishedAt": None, "releaseUrl": None, "assets": [], "updateAvailable": None, "error": None} for app, version in zip(apps, installed)]}

    async def refresh_registry(self):
        def fetch():
            request = Request(REGISTRY_URL, headers={"User-Agent": "DeckyHub"})
            with urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        payload = await asyncio.to_thread(fetch)
        apps = parse_registry(payload)
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.registry_path.with_suffix(".part")
        temporary.write_text(json.dumps(payload), encoding="utf-8")
        os.replace(temporary, self.registry_path)
        self.apps = apps
        return {"count": len(apps)}

    async def save_repo_settings(self, repo: str, values: dict):
        if not REPOSITORY_NAME.fullmatch(repo):
            raise ValueError("Repository must be owner/name")
        item = {
            "channel": "prerelease" if values.get("channel") == "prerelease" else "stable",
            "downloadLocation": values.get("downloadLocation") if values.get("downloadLocation") in ("plugins", "downloads") else "default",
            "assetFilter": [value for value in values.get("assetFilter", []) if isinstance(value, str) and value.strip()][:10],
        }
        self.settings["repoSettings"][repo] = item
        self._save_settings()
        return item

    def _custom_apps(self) -> list[dict]:
        bundled = {app["repo"].casefold() for app in self.apps}
        return [{"id": f"custom-{repo.replace('/', '-')}", "name": repo, "repo": repo, "category": "Custom", "versionStrategy": "semver", "source": "releases", "detect": {"type": "decky-plugin", "repo": repo}, "asset": {"include": [], "exclude": ["source"]}} for repo in self.settings["customRepos"] if repo.casefold() not in bundled]

    async def get_settings(self):
        return self.settings

    async def get_deckyhub_info(self):
        for directory in (Path(getattr(decky, "DECKY_PLUGIN_DIR", PLUGIN_DIR)), Path(PLUGIN_DIR)):
            try:
                package = json.loads((directory / "package.json").read_text(encoding="utf-8"))
                return {"version": str(package["version"])}
            except (KeyError, OSError, json.JSONDecodeError):
                pass
        return {"version": DECKYHUB_VERSION}

    async def save_settings(self, settings: dict):
        self.settings = {
            "verifySha256": bool(settings.get("verifySha256", True)),
            "overwriteExisting": bool(settings.get("overwriteExisting", True)),
            "downloadLocation": "downloads" if settings.get("downloadLocation") == "downloads" else "plugins",
            "updateChannel": "prerelease" if settings.get("updateChannel") == "prerelease" else "stable",
            "language": settings.get("language") if settings.get("language") in SUPPORTED_LANGUAGES else "auto",
            "customRepos": getattr(self, "settings", {}).get("customRepos", []),
            "repoSettings": getattr(self, "settings", {}).get("repoSettings", {}),
        }
        self._save_settings()
        return self.settings

    def _asset_download_dir(self, repo: str | None = None) -> Path:
        location = self.settings.get("repoSettings", {}).get(repo or "", {}).get("downloadLocation", self.settings.get("downloadLocation"))
        return Path(DEFAULT_DOWNLOAD_DIR if location == "downloads" else PLUGIN_DOWNLOAD_DIR)

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

    async def get_custom_repos(self):
        return {"repos": [{"repo": repo} for repo in self.settings["customRepos"]]}

    async def remove_custom_repo(self, repo: str):
        repo = repo.strip()
        if repo not in self.settings["customRepos"]:
            return {"removed": False, "repo": repo}
        self.settings["customRepos"].remove(repo)
        self._save_settings()
        return {"removed": True, "repo": repo}

    async def export_custom_repos(self):
        target_dir = Path(DEFAULT_DOWNLOAD_DIR)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / "DeckyHub-repositories.json"
        if target.exists():
            target = self._next_name(target)
        target.write_text(json.dumps({"schemaVersion": 1, "repos": self.settings["customRepos"]}, indent=2), encoding="utf-8")
        return {"path": str(target)}

    async def import_custom_repos(self, path: str):
        source = Path(path).resolve()
        deck_home = Path(DEFAULT_DOWNLOAD_DIR).parent.resolve()
        if source.suffix.lower() != ".json" or not source.is_relative_to(deck_home):
            raise ValueError("Choose a JSON file inside /home/deck")
        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError("Invalid repository export") from error
        repos = payload.get("repos", []) if isinstance(payload, dict) else payload
        if not isinstance(repos, list):
            raise ValueError("Invalid repository export")
        existing = {app["repo"].casefold() for app in self.apps} | {repo.casefold() for repo in self.settings["customRepos"]}
        added = []
        for repo in repos:
            if isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo) and repo.casefold() not in existing:
                existing.add(repo.casefold())
                added.append(repo)
        if added:
            self.settings["customRepos"].extend(added)
            self._save_settings()
        return {"added": added}

    async def download_asset(self, asset: dict, repo: str | None = None):
        if not isinstance(asset.get("url"), str) or not asset["url"].startswith("https://"):
            raise ValueError("Only HTTPS release assets can be downloaded")
        name = Path(asset.get("name", "download")).name
        if not name or name in (".", ".."):
            raise ValueError("Invalid asset filename")
        target_dir = self._asset_download_dir(repo)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / name
        if target.exists() and not self.settings.get("overwriteExisting"):
            target = self._next_name(target)
        job_id = f"{name}-{len(self.downloads) + 1}"
        self.downloads[job_id] = {"state": "queued", "filename": target.name, "received": 0, "total": asset.get("size") or 0, "path": str(target), "error": None}
        self.download_queue.put_nowait((job_id, asset, target, False))
        return {"jobId": job_id}

    async def queue_downloads(self, items: list[dict]):
        jobs = []
        for item in items:
            result = await self.download_asset(item.get("asset", {}), item.get("repo"))
            jobs.append(result["jobId"])
        return {"jobIds": jobs}

    async def install_deckyhub_update(self, asset: dict):
        url, name = asset.get("url"), Path(str(asset.get("name", ""))).name
        digest = asset.get("sha256")
        if not isinstance(url, str) or not url.startswith(DECKYHUB_RELEASE_PREFIX) or not name.startswith("DeckyHub-") or not name.endswith(".zip") or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            raise ValueError("Invalid DeckyHub release asset")
        job_id = f"deckyhub-update-{len(self.downloads) + 1}"
        target_dir = self._asset_download_dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / name
        if target.exists() and not self.settings.get("overwriteExisting"):
            target = self._next_name(target)
        self.downloads[job_id] = {"state": "queued", "filename": name, "received": 0, "total": asset.get("size") or 0, "path": str(target), "error": None}
        self.download_queue.put_nowait((job_id, asset, target, True))
        return {"jobId": job_id}

    async def _run_download_queue(self):
        while True:
            job_id, asset, target, require_checksum = await self.download_queue.get()
            try:
                await asyncio.to_thread(self._download, job_id, asset, target, require_checksum)
            finally:
                self.download_queue.task_done()

    def _next_name(self, target: Path) -> Path:
        for number in range(1, 1000):
            candidate = target.with_name(f"{target.stem} ({number}){target.suffix}")
            if not candidate.exists():
                return candidate
        raise RuntimeError("Too many files with this name")

    def _download(self, job_id: str, asset: dict, target: Path, require_checksum: bool = False):
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
            if (require_checksum or self.settings.get("verifySha256")) and asset.get("sha256") and self._sha256(temp) != asset["sha256"].lower():
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
            while chunk := response.read(64 * 1024):
                if job_id in self.cancelled:
                    raise InterruptedError("Download cancelled")
                file.write(chunk)
                job["received"] += len(chunk)

    def _download_with_curl(self, job_id: str, asset: dict, temp: Path):
        job = self.downloads[job_id]
        curl = shutil.which("curl", path="/usr/bin:/bin")
        if not curl:
            raise RuntimeError("System curl is unavailable")
        environment = os.environ.copy()
        environment.pop("LD_LIBRARY_PATH", None)
        environment.pop("LD_PRELOAD", None)
        process = subprocess.Popen([curl, "--fail", "--location", "--silent", "--show-error", "--output", str(temp), asset["url"]], stderr=subprocess.PIPE, text=True, env=environment)
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
