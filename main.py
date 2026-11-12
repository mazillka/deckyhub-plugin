"""DeckyHub's backend: the Plugin class Decky Loader loads. Each concern lives in a
py_modules/deckyhub/ module; Plugin combines their mixins and adds its lifecycle."""

import asyncio
import contextlib
import json
import shutil
import sys
import time
import zipfile
from pathlib import Path

# Decky Loader adds py_modules/ to sys.path itself; the tests and the decky-mock bridge
# import main.py directly, so make sure it's there for them too.
sys.path.insert(0, str(Path(__file__).resolve().parent / "py_modules"))

import decky
from deckyhub import paths
from deckyhub.apps import AppsMixin
from deckyhub.backups import BackupsMixin
from deckyhub.downloads import DownloadsMixin
from deckyhub.leftovers import LeftoversMixin
from deckyhub.packs import PENDING_INSTALLS_FILE, PacksMixin
from deckyhub.registry import RegistryMixin
from deckyhub.remote_install import RemoteInstallMixin
from deckyhub.settings import SettingsMixin
from deckyhub.validation import REPOSITORY_NAME


class Plugin(
    SettingsMixin,
    RegistryMixin,
    AppsMixin,
    DownloadsMixin,
    RemoteInstallMixin,
    BackupsMixin,
    LeftoversMixin,
    PacksMixin,
):
    async def _main(self):
        self.settings_path = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "settings.json"
        self.settings = self._load_settings()
        # Start from the cached lists so startup never waits on the network,
        # then refresh from GitHub in the background (see _refresh_registry_in_background).
        self.apps = await asyncio.to_thread(self._load_registry, None, False)
        self.downloads: dict[str, dict] = {}
        self.cancelled: set[str] = set()
        self.download_queue: asyncio.Queue = asyncio.Queue()
        self.queue_worker = asyncio.create_task(self._run_download_queue())
        self.registry_task = asyncio.create_task(self._refresh_registry_in_background())
        self._init_remote_install()
        self.remote_address_task = asyncio.create_task(self._watch_remote_address())
        self.remote_install_start_task = None
        if self.settings.get("remoteInstall"):
            self.remote_install_start_task = asyncio.create_task(self._start_remote_transport())
        decky.logger.info("DeckyHub %s started", (await self.get_deckyhub_info())["version"])

    async def _unload(self):
        # Decky calls this before stopping or reloading DeckyHub (an update included).
        for name in ("remote_install_start_task", "remote_address_task"):
            task = getattr(self, name, None)
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        await self._stop_remote_transport()
        for task in (getattr(self, "queue_worker", None), getattr(self, "registry_task", None)):
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    async def _uninstall(self):
        # Staged install ZIPs (stage_install) are the only files DeckyHub keeps in its runtime folder.
        await asyncio.to_thread(shutil.rmtree, Path(decky.DECKY_PLUGIN_RUNTIME_DIR) / "installs", True)

    async def get_deckyhub_info(self):
        try:
            version = str(json.loads((Path(paths.PLUGIN_DIR) / "package.json").read_text(encoding="utf-8"))["version"])
        except (KeyError, OSError, json.JSONDecodeError):
            version = "unknown"
        # The file pickers open here; it depends on the device's user.
        return {"version": version, "downloadDir": paths.DEFAULT_DOWNLOAD_DIR}

    async def get_pending_installs(self):
        """The plugins the Desktop Mode installer's checklist saved for DeckyHub to install
        (pending-installs.json in the settings folder, which an imported plugin pack writes too):
        repositories the registry list or the user's own list has loaded, in its spelling. Nothing else gets through, and it never raises."""
        try:
            saved = json.loads(
                (Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / PENDING_INSTALLS_FILE).read_text(encoding="utf-8")
            )
        except (OSError, ValueError):
            return []
        # The registry's plugins and the user's own repositories (a plugin pack can add some).
        custom = self._custom_apps() if hasattr(self, "settings") else []
        listed = {app["repo"].casefold(): app["repo"] for app in [*getattr(self, "apps", []), *custom]}
        repos: list[str] = []
        for repo in saved if isinstance(saved, list) else []:
            match = listed.get(repo.casefold()) if isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo) else None
            if match and match not in repos:
                repos.append(match)
        return repos

    async def clear_pending_installs(self):
        try:
            (Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / PENDING_INSTALLS_FILE).unlink()
        except FileNotFoundError:
            pass
        except OSError as error:
            decky.logger.warning("Could not remove %s: %s", PENDING_INSTALLS_FILE, error)
        return {"cleared": True}

    # Frontend errors (GitHub lookups, installs) only reach the CEF console
    # otherwise, so they're forwarded here to land in the exported log.
    async def log_frontend(self, message: str):
        decky.logger.warning("[frontend] %s", str(message)[:2000])

    async def export_logs(self):
        def export():
            target = self._export_target(f"DeckyHub-logs-{time.strftime('%Y%m%d-%H%M%S')}.zip")
            with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
                for log in sorted(Path(decky.DECKY_PLUGIN_LOG_DIR).glob("*.log")):
                    archive.write(log, log.name)
            return target

        # Compressing the logs can take a while; keep Decky's event loop free meanwhile.
        return {"path": str(await asyncio.to_thread(export))}
