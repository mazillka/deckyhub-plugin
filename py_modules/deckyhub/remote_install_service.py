"""Remote request authorization and state; transport must authenticate its server.

All state is in memory. Restart revokes pairings and abandons pending requests.
This module never starts an install; only the local UI can approve and claim one.
"""

import hashlib
import hmac
import re
import secrets
import time

from .remote_install_queue import RemoteInstallQueue

_SECRET = re.compile(r"[A-Za-z0-9_-]{43}\Z")


class RemoteInstallService:
    def __init__(self, apps, clock=time.monotonic):
        self.apps = apps
        self.clock = clock
        self.queue = RemoteInstallQueue(clock=clock)
        self.code = None
        self.code_expiry = 0
        self.pairings = {}
        self.devices = {}
        self.attempts = []

    def begin_pairing(self):
        self.code = f"{secrets.randbelow(1000000):06d}"
        self.code_expiry = self.clock() + 120
        return {"code": self.code, "expiresInSeconds": 120}

    def _sweep(self):
        now = self.clock()
        for key in list(self.pairings):
            if now >= self.pairings[key]["expires"]:
                del self.pairings[key]
        self.attempts = [t for t in self.attempts if now - t < 60]

    def pair(self, code, name, secret):
        self._sweep()
        if len(self.attempts) >= 5:
            raise ValueError("too many pairing attempts")
        self.attempts.append(self.clock())
        if (
            not isinstance(code, str)
            or self.code is None
            or self.clock() >= self.code_expiry
            or not hmac.compare_digest(code, self.code)
        ):
            raise ValueError("invalid or expired pairing code")
        if not isinstance(name, str) or not name.strip() or len(name) > 80:
            raise ValueError("invalid browser name")
        if not isinstance(secret, str) or not _SECRET.fullmatch(secret):
            raise ValueError("invalid pairing secret")
        if len(self.pairings) >= 16 or len(self.devices) >= 16:
            raise ValueError("pairing limit reached")
        self.code = None
        pair_id = secrets.token_urlsafe(24)
        self.pairings[pair_id] = {
            "name": name.strip(),
            "secret": hashlib.sha256(secret.encode()).digest(),
            "status": "pending",
            "expires": self.clock() + 120,
            "token": None,
        }
        return {"pairingId": pair_id}

    def pair_status(self, pair_id, secret):
        self._sweep()
        p = self.pairings.get(pair_id) if isinstance(pair_id, str) else None
        if (
            not p
            or not isinstance(secret, str)
            or not _SECRET.fullmatch(secret)
            or not hmac.compare_digest(p["secret"], hashlib.sha256(secret.encode()).digest())
        ):
            raise ValueError("pairing not found")
        result = {"status": p["status"]}
        if p["status"] == "approved":
            result["token"] = p["token"]
        return result

    def list_pairings(self):
        self._sweep()
        return [{"id": k, "name": p["name"]} for k, p in self.pairings.items() if p["status"] == "pending"]

    def decide_pairing(self, pair_id, approve):
        self._sweep()
        p = self.pairings.get(pair_id)
        if not p or p["status"] != "pending" or type(approve) is not bool:
            raise ValueError("pairing not pending")
        if approve:
            token = secrets.token_urlsafe(32)
            device_id = secrets.token_urlsafe(16)
            self.devices[device_id] = {"name": p["name"], "token_hash": hashlib.sha256(token.encode()).digest()}
            p["token"], p["status"], p["device_id"] = token, "approved", device_id
        else:
            p["status"] = "rejected"
        return {"status": p["status"]}

    def list_devices(self):
        return [{"id": k, "name": d["name"]} for k, d in self.devices.items()]

    def revoke(self, device_id):
        device = self.devices.pop(device_id, None)
        if device:
            self.queue.cancel_owner_pending(device_id)
            for p in self.pairings.values():
                if p.get("device_id") == device_id:
                    p["status"], p["token"] = "rejected", None
        return bool(device)

    def owner(self, token):
        if not isinstance(token, str) or not _SECRET.fullmatch(token):
            raise ValueError("unauthorized")
        digest = hashlib.sha256(token.encode()).digest()
        for device_id, device in self.devices.items():
            if hmac.compare_digest(digest, device["token_hash"]):
                return device_id
        raise ValueError("unauthorized")

    def remote(self, message):
        if not isinstance(message, dict):
            raise ValueError("invalid request")
        op = message.get("op")
        if op == "pair":
            return self.pair(message.get("code"), message.get("name"), message.get("pairingSecret"))
        if op == "pair_status":
            return self.pair_status(message.get("pairingId"), message.get("pairingSecret"))
        owner = self.owner(message.get("token"))
        if op == "request":
            plugin_id = message.get("pluginId")
            if not isinstance(plugin_id, str) or not any(a.get("id") == plugin_id for a in self.apps()):
                raise ValueError("plugin not in registry")
            r = self.queue.create(owner, message.get("idempotencyKey"), plugin_id, message.get("releaseTag"))
        elif op == "status":
            r = self.queue.get(owner, message.get("requestId"))
        elif op == "cancel":
            r = self.queue.cancel(owner, message.get("requestId"))
        else:
            raise ValueError("unsupported operation")
        if r is None:
            raise ValueError("request not found")
        return {"requestId": r.id, "status": r.status}

    def list_requests(self):
        return [
            {
                "id": r.id,
                "pluginId": r.plugin_id,
                "releaseTag": r.release_tag,
                "ownerName": self.devices.get(r.owner, {}).get("name", "Revoked browser"),
                "status": r.status,
            }
            for r in self.queue.pending()
        ]

    def decide_request(self, request_id, approve):
        if type(approve) is not bool:
            raise ValueError("invalid decision")
        r = self.queue.transition_local(request_id, "approved" if approve else "rejected")
        return {"id": r.id, "status": r.status}

    def claim(self, request_id):
        r = self.queue.transition_local(request_id, "installing")
        if not any(a.get("id") == r.plugin_id for a in self.apps()):
            self.queue.transition_local(request_id, "failed")
            raise ValueError("plugin no longer in registry")
        return {"id": r.id, "pluginId": r.plugin_id, "releaseTag": r.release_tag, "status": r.status}

    def finish(self, request_id, success):
        if type(success) is not bool:
            raise ValueError("invalid outcome")
        r = self.queue.transition_local(request_id, "installed" if success else "failed")
        return {"id": r.id, "status": r.status}

    def finish_unknown(self, request_id):
        r = self.queue.transition_local(request_id, "unknown")
        return {"id": r.id, "status": r.status}
