"""Downloading release ZIPs: the queue behind Download ZIP, and staging for Decky's installer."""

import asyncio
import hashlib
import os
import shutil
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request

import decky

from . import paths
from .net import OPENER
from .validation import REPOSITORY_NAME

ACTIVE_DOWNLOAD_STATES = ("queued", "downloading")


class DownloadsMixin:
    async def clear_downloads(self):
        directory = Path(paths.PLUGIN_DOWNLOAD_DIR)
        # Files an active download is writing or about to write stay put.
        active = {
            Path(path)
            for job in getattr(self, "downloads", {}).values()
            if job["state"] in ACTIVE_DOWNLOAD_STATES and job.get("path")
            for path in (job["path"], job["path"] + ".part")
        }

        def clear():
            if not directory.is_dir():
                return 0
            removed = 0
            for entry in directory.iterdir():
                if entry in active:
                    continue
                # One file that won't go (permissions, busy) doesn't stop the rest.
                try:
                    if entry.is_dir() and not entry.is_symlink():
                        shutil.rmtree(entry)
                    else:
                        entry.unlink()
                except OSError as error:
                    decky.logger.warning("Could not remove %s: %s", entry, error)
                    continue
                removed += 1
            return removed

        removed = await asyncio.to_thread(clear)
        decky.logger.info("Emptied %s: removed %d items", directory, removed)
        return {"removed": removed}

    async def list_downloads(self):
        directory = Path(paths.PLUGIN_DOWNLOAD_DIR)

        def list_items():
            if not directory.is_dir():
                return []
            return [
                {"name": entry.name, "directory": entry.is_dir() and not entry.is_symlink()}
                for entry in sorted(directory.iterdir(), key=lambda entry: entry.name.casefold())
            ]

        return {"items": await asyncio.to_thread(list_items)}

    async def download_asset(self, asset: dict, repo: str | None = None):
        try:
            name = self._validate_download_asset(asset, repo)
            for job_id, job in self.downloads.items():
                if (
                    job.get("repo") == repo
                    and job.get("url") == asset["url"]
                    and job["state"] in ACTIVE_DOWNLOAD_STATES
                ):
                    return {"jobId": job_id}
            target_dir = Path(paths.PLUGIN_DOWNLOAD_DIR)
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / name
            reserved = {
                Path(job["path"])
                for job in self.downloads.values()
                if job["state"] in ACTIVE_DOWNLOAD_STATES and job.get("path")
            }
            if not self.settings.get("overwriteExisting") and (target.exists() or target in reserved):
                target = self._next_name(target, reserved)
            self._prune_downloads()
            job_id = f"{name}-{time.monotonic_ns()}"
            self.downloads[job_id] = {
                "state": "queued",
                "filename": target.name,
                "received": 0,
                "total": asset.get("size") or 0,
                "path": str(target),
                "error": None,
                "repo": repo,
                "url": asset["url"],
            }
            self.download_queue.put_nowait((job_id, asset, target))
            decky.logger.info("Queued download of %s to %s", asset["url"], target)
            return {"jobId": job_id}
        except (OSError, ValueError) as error:
            name = asset.get("name", "download") if isinstance(asset, dict) else "download"
            decky.logger.error("Can't start %s from %s: %s", name, repo, error)
            return {"error": f"Can't start {name}: {error}"}

    async def stage_install(self, asset: dict, repo: str | None = None, job_id: str | None = None):
        """Downloads a release ZIP for Decky Loader's installer to read as file://.

        Decky Loader 3.3.0's own download of a GitHub release URL was seen to hang
        for good on a real Deck (its request never opened a socket, no timeout
        fired) while this downloader fetched the same file in seconds. Decky reads
        a file:// ZIP straight from disk and still checks the SHA-256 it's given.
        The frontend may pass job_id to poll progress (get_download) and cancel
        it (cancel_download) while this runs; it never names the file.
        """
        target_id, registered = f"install-{time.monotonic_ns()}", None
        try:
            name = self._validate_download_asset(asset, repo)
            registered = job_id if isinstance(job_id, str) and job_id and job_id not in self.downloads else target_id
            job_id = registered
            # Registered before any disk work so the first poll finds it. Kept by
            # reference too: download_asset prunes finished jobs from self.downloads,
            # which can happen before this resumes after the download.
            job = self.downloads[job_id] = {
                "state": "queued",
                "filename": name,
                "received": 0,
                "total": asset.get("size") or 0,
                "path": None,
                "error": None,
            }
            directory = Path(decky.DECKY_PLUGIN_RUNTIME_DIR) / "installs"
            directory.mkdir(parents=True, exist_ok=True)
            # Decky reads the file only once its confirm dialog is accepted, which
            # may be after DeckyHub reloads, so old ones are swept here instead.
            for old in directory.iterdir():
                if old.is_file() and old.stat().st_mtime < time.time() - 24 * 3600:
                    old.unlink(missing_ok=True)
            target = directory / f"{target_id}-{name}"
            await asyncio.to_thread(self._download, job_id, asset, target)
            self.downloads.pop(job_id, None)
            if job["state"] != "complete":
                return {"error": job["error"] or f"Download {job['state']}"}
            return {"path": str(target)}
        except (OSError, ValueError) as error:
            if registered:
                self.downloads.pop(registered, None)
            decky.logger.error(
                "Can't stage %s for install: %s", asset.get("url") if isinstance(asset, dict) else asset, error
            )
            return {"error": str(error)}

    @staticmethod
    def _validate_download_asset(asset: dict, repo: str | None) -> str:
        prefix = (
            f"https://github.com/{repo}/releases/download/"
            if isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo)
            else ""
        )
        if (
            not isinstance(asset, dict)
            or not prefix
            or not isinstance(asset.get("url"), str)
            or not asset["url"].startswith(prefix)
        ):
            raise ValueError("Only GitHub release assets for the selected repository can be downloaded")
        # No "." or ".." segments (or backslashes): the URL has to stay under the repository's releases.
        if "\\" in asset["url"] or any(
            part in (".", "..") for part in asset["url"][len(prefix) :].split("?")[0].split("/")
        ):
            raise ValueError("Only GitHub release assets for the selected repository can be downloaded")
        name = Path(asset.get("name", "download")).name
        if not name or name in (".", ".."):
            raise ValueError("Invalid asset filename")
        return name

    async def _run_download_queue(self):
        while True:
            job_id, asset, target = await self.download_queue.get()
            try:
                await asyncio.to_thread(self._download, job_id, asset, target)
            finally:
                self.download_queue.task_done()
                self._prune_downloads()

    def _next_name(self, target: Path, reserved: set[Path] | frozenset[Path] = frozenset()) -> Path:
        for number in range(1, 1000):
            candidate = target.with_name(f"{target.stem} ({number}){target.suffix}")
            if candidate not in reserved and not candidate.exists():
                return candidate
        raise RuntimeError("Too many files with this name")

    def _download(self, job_id: str, asset: dict, target: Path):
        job, temp = self.downloads[job_id], target.with_name(target.name + ".part")
        try:
            if job_id in self.cancelled:
                raise InterruptedError("Download cancelled")
            job["state"] = "downloading"
            try:
                self._download_with_urllib(job_id, asset, temp)
            except URLError as error:
                decky.logger.warning("urllib failed for %s (%s), retrying with curl", asset["url"], error)
                self._download_with_curl(job_id, asset, temp)
            if asset.get("sha256"):
                with open(temp, "rb") as file:
                    if hashlib.file_digest(file, "sha256").hexdigest() != asset["sha256"].lower():
                        raise RuntimeError("SHA256 verification failed")
            os.replace(temp, target)
            job["state"] = "complete"
            decky.logger.info("Downloaded %s to %s", asset["url"], target)
        except InterruptedError:
            job["state"] = "cancelled"
            temp.unlink(missing_ok=True)
            decky.logger.info("Cancelled download of %s", asset["url"])
        except Exception as error:
            job.update({"state": "error", "error": str(error)})
            decky.logger.error("Download of %s failed: %s", asset["url"], error)
            temp.unlink(missing_ok=True)
        finally:
            job["finished_at"] = time.monotonic()
            self.cancelled.discard(job_id)

    @staticmethod
    def _size_limit(asset: dict) -> int | None:
        """The file's size as GitHub states it, which a download may not pass: a server
        sending more would otherwise fill the device's storage. None when it isn't known."""
        size = asset.get("size")
        return size if type(size) is int and size > 0 else None

    def _download_with_urllib(self, job_id: str, asset: dict, temp: Path):
        job = self.downloads[job_id]
        limit = self._size_limit(asset)
        request = Request(asset["url"], headers={"User-Agent": "DeckyHub/0.2"})
        with OPENER.open(request, timeout=30) as response, open(temp, "wb") as file:
            job["total"] = int(response.headers.get("Content-Length") or job["total"] or 0)
            while chunk := response.read(64 * 1024):
                if job_id in self.cancelled:
                    raise InterruptedError("Download cancelled")
                file.write(chunk)
                job["received"] += len(chunk)
                if limit and job["received"] > limit:
                    raise RuntimeError("The download is larger than the release file")

    def _download_with_curl(self, job_id: str, asset: dict, temp: Path):
        job = self.downloads[job_id]
        curl = shutil.which("curl", path="/usr/bin:/bin")
        if not curl:
            raise RuntimeError("System curl is unavailable")
        environment = os.environ.copy()
        environment.pop("LD_LIBRARY_PATH", None)
        environment.pop("LD_PRELOAD", None)
        limit = self._size_limit(asset)
        process = subprocess.Popen(
            [
                curl,
                *(["--max-filesize", str(limit)] if limit else []),
                "--fail",
                "--location",
                "--proto",
                "=https",
                "--proto-redir",
                "=https",
                "--silent",
                "--show-error",
                "--connect-timeout",
                "15",
                "--speed-limit",
                "1024",
                "--speed-time",
                "60",
                "--output",
                str(temp),
                asset["url"],
            ],
            stderr=subprocess.PIPE,
            text=True,
            env=environment,
        )
        while process.poll() is None:
            if job_id in self.cancelled:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                raise InterruptedError("Download cancelled")
            job["received"] = temp.stat().st_size if temp.exists() else 0
            time.sleep(0.2)
        if process.returncode:
            raise RuntimeError((process.stderr.read() or "curl download failed").strip())
        job["received"] = temp.stat().st_size

    def _prune_downloads(self):
        cutoff = time.monotonic() - 300
        finished = sorted(
            ((job["finished_at"], key) for key, job in self.downloads.items() if "finished_at" in job),
            reverse=True,
        )
        for index, (finished_at, key) in enumerate(finished):
            if index >= 100 or finished_at < cutoff:
                self.downloads.pop(key, None)

    async def get_download(self, job_id: str):
        self._prune_downloads()
        return self.downloads.get(job_id, {"state": "missing"})

    async def cancel_download(self, job_id: str):
        # Only active jobs: a finished job's id would otherwise stay in the set.
        if self.downloads.get(job_id, {}).get("state") not in ACTIVE_DOWNLOAD_STATES:
            return {"ok": False}
        self.cancelled.add(job_id)
        return {"ok": True}
