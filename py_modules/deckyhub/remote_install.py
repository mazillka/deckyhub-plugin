"""Remote install management and RPC interface."""

import asyncio

import decky

from .remote_install_service import RemoteInstallService
from .remote_install_transport import start_transport


class RemoteInstallMixin:
    def _init_remote_install(self):
        self.remote_install_service = RemoteInstallService(
            apps=lambda: getattr(self, "apps", []),
        )
        self.remote_install_server = None
        self.remote_install_address = None
        self.remote_install_fingerprint = None
        self.remote_install_error = None
        self._remote_transport_lock = asyncio.Lock()

    async def _start_remote_transport(self):
        async with self._remote_transport_lock:
            if self.remote_install_server is not None or not self.settings.get("remoteInstall", False) or not self.settings.get("remoteInstallFeature", False):
                return
            try:
                server, url, fingerprint = await start_transport(self.remote_install_service)
                # Disable can occur while the listener is starting. Never leave it active.
                if not self.settings.get("remoteInstall", False) or not self.settings.get("remoteInstallFeature", False):
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
                self.remote_install_error = str(error)
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
            "error": self.remote_install_error,
            "pairingCode": code,
            "pairings": service.list_pairings(),
            "devices": service.list_devices(),
            "requests": service.list_requests(),
        }

    async def set_remote_install_enabled(self, enabled: bool):
        if type(enabled) is not bool:
            raise ValueError("enabled must be a boolean")
        if enabled and not self.settings.get("remoteInstallFeature", False):
            raise ValueError("Remote install feature is disabled")
        self.settings["remoteInstall"] = enabled
        self._save_settings()
        if self.settings["remoteInstall"]:
            await self._start_remote_transport()
        else:
            await self._stop_remote_transport()
            # Closing the listener also revokes all in-memory credentials and requests.
            self.remote_install_service = RemoteInstallService(apps=lambda: getattr(self, "apps", []))
        return await self.get_remote_install_status()

    async def set_remote_install_feature_enabled(self, enabled: bool):
        if type(enabled) is not bool:
            raise ValueError("enabled must be a boolean")
        self.settings["remoteInstallFeature"] = enabled
        if not enabled:
            self.settings["remoteInstall"] = False
            await self._stop_remote_transport()
            self.remote_install_service = RemoteInstallService(apps=lambda: getattr(self, "apps", []))
        self._save_settings()
        return await self.get_settings()

    async def begin_remote_pairing(self):
        if not getattr(self, "settings", {}).get("remoteInstall", False) or not self.settings.get("remoteInstallFeature", False):
            raise ValueError("Remote install is disabled")
        if self.remote_install_server is None:
            await self._start_remote_transport()
        if self.remote_install_server is None:
            raise ValueError(self.remote_install_error or "Remote install transport unavailable")
        return self.remote_install_service.begin_pairing()

    async def decide_remote_pairing(self, pair_id: str, approve: bool):
        return self.remote_install_service.decide_pairing(pair_id, approve)

    async def revoke_remote_device(self, device_id: str):
        revoked = self.remote_install_service.revoke(device_id)
        return {"revoked": revoked}

    async def decide_remote_request(self, request_id: str, approve: bool):
        return self.remote_install_service.decide_request(request_id, approve)

    async def claim_remote_request(self, request_id: str):
        return self.remote_install_service.claim(request_id)

    async def finish_remote_request(self, request_id: str, success: bool):
        return self.remote_install_service.finish(request_id, success)

    async def finish_remote_request_unknown(self, request_id: str):
        return self.remote_install_service.finish_unknown(request_id)
