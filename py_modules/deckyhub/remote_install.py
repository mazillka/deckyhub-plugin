"""Remote install management and RPC interface."""

import asyncio
import re
import socket
from urllib.parse import urlsplit

import decky

from .remote_install_service import RemoteInstallService
from .remote_install_store import RemoteInstallStore
from .remote_install_transport import identity_rotated, lan_address, start_transport


class RemoteInstallMixin:
    def _remote_apps(self) -> list:
        custom = self._custom_apps() if hasattr(self, "_custom_apps") else []
        return [*getattr(self, "apps", []), *custom]

    def _remote_inventory(self) -> list:
        return self._remote_installed_plugins() if hasattr(self, "_remote_installed_plugins") else []

    def _init_remote_install(self):
        path = getattr(self, "settings_path", None)
        self.remote_install_service = RemoteInstallService(
            apps=self._remote_apps,
            installed=self._remote_inventory,
            store=RemoteInstallStore(path.with_name("remote-install.json")) if path else None,
        )
        self.remote_install_service.on_trusted_request = self._announce_trusted_request
        self.remote_install_server = None
        self.remote_install_address = None
        self.remote_install_fingerprint = None
        self.remote_install_error = None
        self._remote_transport_lock = asyncio.Lock()

    def _announce_trusted_request(self):
        # Wakes the frontend's runner (src/remoteRunner.ts), which otherwise never polls.
        # Kept on self: the event loop holds only a weak reference to a running task.
        self._trusted_request_event = asyncio.ensure_future(decky.emit("remote_trusted_request"))

    async def _start_remote_transport(self):
        async with self._remote_transport_lock:
            if self.remote_install_server is not None or not self.settings.get("remoteInstall", False):
                return
            try:
                server, url, fingerprint = await start_transport(self.remote_install_service)
                # Disable can occur while the listener is starting. Never leave it active.
                if not self.settings.get("remoteInstall", False):
                    server.close()
                    return
                self.remote_install_server = server
                self.remote_install_address = url
                self.remote_install_fingerprint = fingerprint
                self.remote_install_error = None
                decky.logger.info("Remote install transport started at %s", url)
            except Exception as error:
                self.remote_install_server = None
                self.remote_install_address = None
                self.remote_install_fingerprint = None
                # A missing or mismatched bundled library is not something the user can fix from here.
                self.remote_install_error = (
                    "Remote Install is not supported on this system" if isinstance(error, ImportError) else str(error)
                )
                decky.logger.warning("Remote install transport failed to start: %s", error)

    async def _stop_remote_transport(self):
        if not hasattr(self, "_remote_transport_lock"):
            return
        async with self._remote_transport_lock:
            if self.remote_install_server is not None:
                try:
                    self.remote_install_server.close()
                except Exception as error:
                    decky.logger.warning("Error stopping remote install server: %s", error)
                self.remote_install_server = None
                decky.logger.info("Remote install transport stopped")
            self.remote_install_address = None
            self.remote_install_fingerprint = None
            self.remote_install_error = None

    async def _refresh_remote_address(self):
        if not self.settings.get("remoteInstall"):
            return
        try:
            address = lan_address()
        except OSError:
            return
        previous = self.remote_install_address
        # Also restart when the certificate is about to expire, so it never runs out while serving.
        if previous and (
            urlsplit(previous).hostname != address
            or (
                self.remote_install_server is not None
                and identity_rotated(self.remote_install_service, self.remote_install_fingerprint)
            )
        ):
            await self._stop_remote_transport()
        if self.remote_install_server is None:
            await self._start_remote_transport()

    async def _watch_remote_address(self):
        while True:
            await asyncio.sleep(10)
            await self._refresh_remote_address()

    async def get_remote_install_status(self):
        enabled = bool(getattr(self, "settings", {}).get("remoteInstall", False))
        service = getattr(self, "remote_install_service", None)
        if service is None:
            self._init_remote_install()
            service = self.remote_install_service

        code = service.code if (service.code and service.clock() < service.code_expiry) else None
        return {
            "enabled": enabled,
            "active": self.remote_install_server is not None,
            "address": self.remote_install_address,
            "fingerprint": self.remote_install_fingerprint,
            "deviceName": re.sub(r"[^\w .-]", "", socket.gethostname())[:40] or None,
            "error": self.remote_install_error,
            "pairingCode": code,
            # Seconds the code has left, for the countdown beside the QR code.
            "pairingExpiresIn": max(0, round(service.code_expiry - service.clock())) if code else None,
            "pairings": service.list_pairings(),
            "devices": service.list_devices(),
            "requests": service.list_requests(),
            "trustedRequests": service.list_trusted_requests(),
        }

    async def set_remote_install_enabled(self, enabled: bool):
        if type(enabled) is not bool:
            raise ValueError("enabled must be a boolean")
        self.settings["remoteInstall"] = enabled
        self._save_settings()
        if self.settings["remoteInstall"]:
            await self._start_remote_transport()
        else:
            await self._stop_remote_transport()
            # Pending pairings and requests end with the listener; paired devices stay until revoked.
            self.remote_install_service.reset_session()
        return await self.get_remote_install_status()

    async def begin_remote_pairing(self):
        if not getattr(self, "settings", {}).get("remoteInstall", False):
            raise ValueError("Remote install is disabled")
        if self.remote_install_server is None:
            await self._start_remote_transport()
        if self.remote_install_server is None:
            raise ValueError(self.remote_install_error or "Remote install transport unavailable")
        return self.remote_install_service.begin_pairing()

    async def decide_remote_pairing(self, pair_id: str, approve: bool):
        return self.remote_install_service.decide_pairing(pair_id, approve)

    async def set_remote_device_trusted(self, device_id: str, trusted: bool):
        return self.remote_install_service.set_trusted(device_id, trusted)

    async def revoke_remote_device(self, device_id: str):
        revoked = self.remote_install_service.revoke(device_id)
        return {"revoked": revoked}

    async def decide_remote_request(self, request_id: str, approve: bool):
        return self.remote_install_service.decide_request(request_id, approve)

    async def claim_remote_request(self, request_id: str):
        if not self.settings.get("remoteInstall"):
            raise ValueError("Remote install is disabled")
        service = self.remote_install_service
        installed = await asyncio.to_thread(self._remote_inventory)
        if service is not self.remote_install_service or not self.settings.get("remoteInstall"):
            raise ValueError("Remote install is disabled")
        return service.claim(request_id, installed=installed)

    async def get_remote_installed_version(self, plugin_name: str):
        """The installed version of a plugin by its Decky Loader name, or None once it is gone."""
        installed = await asyncio.to_thread(self._remote_inventory)
        for row in installed:
            if isinstance(row.get("pluginName"), str) and row["pluginName"].casefold() == str(plugin_name).casefold():
                return {"version": row.get("version"), "disabled": bool(row.get("disabled"))}
        return {"version": None, "disabled": False}

    async def finish_remote_request(self, request_id: str, success: bool):
        return self.remote_install_service.finish(request_id, success)

    async def finish_remote_request_unknown(self, request_id: str):
        return self.remote_install_service.finish_unknown(request_id)
