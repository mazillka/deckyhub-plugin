"""Remote request authorization and state; transport must authenticate its server.

All state is in memory. Restart revokes pairings and abandons pending requests.
This module never starts an install; only the local UI can approve and claim one.
"""

import asyncio
import hashlib
import hmac
import json
import re
import secrets
import time

from .remote_install_queue import RemoteInstallQueue

_SECRET = re.compile(r"[A-Za-z0-9_-]{43}\Z")


class RemoteInstallService:
    def __init__(self, apps, clock=time.monotonic, installed=None, store=None):
        self.store = store
        saved = store.load() if store else {}
        self.installed = installed or (lambda: [])
        self.apps = apps
        self.clock = clock
        self.queue = RemoteInstallQueue(clock=clock)
        self.code = None
        self.pairing_token_hash = None
        self.code_expiry = 0
        self.pairings = {}
        self.devices = {}
        for device_id, device in (saved.get("devices") or {}).items():
            try:
                self.devices[device_id] = {
                    "name": str(device["name"])[:80],
                    "token_hash": bytes.fromhex(device["token_hash"]),
                    "trusted": device.get("trusted") is True,
                }
            except (KeyError, TypeError, ValueError):
                continue
        # PEM pairs {"current": [cert, key], "next": [cert, key] | None}; see remote_install_transport.
        identity = saved.get("identity")
        self.identity = identity if isinstance(identity, dict) else None
        self.pins = {}
        self.discovery = None
        self.attempts = []

    def persist(self):
        if self.store:
            self.store.save(
                {
                    "devices": {
                        k: {"name": d["name"], "token_hash": d["token_hash"].hex(), "trusted": d["trusted"]}
                        for k, d in self.devices.items()
                    },
                    "identity": self.identity,
                }
            )

    def reset_session(self):
        """Forget everything that only lasts while the listener runs; paired devices stay."""
        self.code = self.pairing_token_hash = None
        self.pairings = {}
        self.attempts = []
        self.queue = RemoteInstallQueue(clock=self.clock)

    def begin_pairing(self):
        self.code = f"{secrets.randbelow(1000000):06d}"
        token = secrets.token_urlsafe(32)
        self.pairing_token_hash = hashlib.sha256(token.encode()).digest()
        self.code_expiry = self.clock() + 120
        return {"code": self.code, "pairingToken": token, "expiresInSeconds": 120}

    def _sweep(self):
        now = self.clock()
        for key in list(self.pairings):
            if now >= self.pairings[key]["expires"]:
                del self.pairings[key]
        self.attempts = [t for t in self.attempts if now - t < 60]

    def pair(self, code, name, secret, pairing_token=None):
        self._sweep()
        # Only guesses of the six-digit code are limited; the one-time token cannot be guessed.
        if pairing_token is None and len(self.attempts) >= 5:
            raise ValueError("too many pairing attempts")
        if self.code is None or self.clock() >= self.code_expiry:
            raise ValueError("invalid or expired pairing code")
        if pairing_token is None:
            valid = isinstance(code, str) and code.isascii() and hmac.compare_digest(code, self.code)
        else:
            valid = (
                isinstance(pairing_token, str)
                and _SECRET.fullmatch(pairing_token)
                and self.pairing_token_hash is not None
                and hmac.compare_digest(self.pairing_token_hash, hashlib.sha256(pairing_token.encode()).digest())
            )
        if not valid:
            if pairing_token is None:
                self.attempts.append(self.clock())
            raise ValueError("invalid or expired pairing code")
        if not isinstance(name, str) or not name.strip() or len(name) > 80:
            raise ValueError("invalid browser name")
        if not isinstance(secret, str) or not _SECRET.fullmatch(secret):
            raise ValueError("invalid pairing secret")
        if len(self.pairings) >= 16 or len(self.devices) >= 16:
            raise ValueError("pairing limit reached")
        self.code = None
        self.pairing_token_hash = None
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
            self.devices[device_id] = {
                "name": p["name"],
                "token_hash": hashlib.sha256(token.encode()).digest(),
                "trusted": False,
            }
            self.persist()
            p["token"], p["status"], p["device_id"] = token, "approved", device_id
        else:
            p["status"] = "rejected"
        return {"status": p["status"]}

    def list_devices(self):
        return [{"id": k, "name": d["name"], "trusted": d["trusted"]} for k, d in self.devices.items()]

    def set_trusted(self, device_id, trusted):
        """Let a device's requests run without asking. Only the local UI can call this."""
        if type(trusted) is not bool or device_id not in self.devices:
            raise ValueError("unknown device")
        self.devices[device_id]["trusted"] = trusted
        self.persist()
        return {"id": device_id, "trusted": trusted}

    def revoke(self, device_id):
        device = self.devices.pop(device_id, None)
        if device:
            self.persist()
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

    async def remote_async(self, message: dict) -> dict:
        installed = None
        if isinstance(message, dict) and message.get("op") in ("plugins", "request"):
            self.owner(message.get("token"))
            installed = await asyncio.to_thread(self.installed)
        return self.remote(message, installed=installed)

    def _snapshot(self, plugin_id: str, action: str, installed: list) -> tuple:
        app = next((a for a in self.apps() if a.get("id") == plugin_id), None)
        if not app:
            raise ValueError("plugin not in registry")
        repo = app.get("repo")
        matches = [
            r
            for r in installed
            if r.get("id") == plugin_id or (repo and str(r.get("repo", "")).casefold() == repo.casefold())
        ]
        if any(r.get("identityUnverified") is not False for r in matches) or len(matches) > 1:
            raise ValueError("installed identity is unverified")
        row = matches[0] if matches else None
        if row and (
            not repo
            or str(row.get("repo", "")).casefold() != repo.casefold()
            or not row.get("pluginName")
            or sum(
                r.get("pluginName", "").casefold() == row["pluginName"].casefold()
                for r in installed
                if isinstance(r.get("pluginName"), str)
            )
            != 1
        ):
            raise ValueError("installed identity is unverified")
        if action in ("update", "uninstall") and not row:
            raise ValueError("plugin is not installed")
        if (repo or "").casefold() == "mazillka/deckyhub-plugin" or (
            row and row["pluginName"].casefold() == "deckyhub"
        ):
            raise ValueError("DeckyHub must be managed locally")
        return repo, row.get("pluginName") if row else None, row.get("version") if row else None

    def _snapshot_installed_name(self, plugin_name, installed: list) -> tuple:
        """Identify an installed plugin by the name Decky Loader uninstalls it by.

        Used for plugins the registry cannot vouch for; it never lets a request pick a repository.
        """
        if not isinstance(plugin_name, str) or not 0 < len(plugin_name) <= 100:
            raise ValueError("invalid plugin name")
        if plugin_name.casefold() == "deckyhub":
            raise ValueError("DeckyHub must be managed locally")
        rows = [
            r
            for r in installed
            if isinstance(r.get("pluginName"), str) and r["pluginName"].casefold() == plugin_name.casefold()
        ]
        if len(rows) != 1:
            raise ValueError("installed identity is unverified")
        row = rows[0]
        if str(row.get("repo") or "").casefold() == "mazillka/deckyhub-plugin":
            raise ValueError("DeckyHub must be managed locally")
        return row.get("repo"), row["pluginName"], row.get("version")

    def _plugins_page(self, message: dict, installed: list) -> dict:
        offset = message.get("offset", 0)
        if type(offset) is not int or offset < 0:
            raise ValueError("invalid offset")

        # ASCII output bounds include JSON escaping, even for unusual manifest text.
        def bounded(value):
            if value is None:
                return None
            value = str(value)[:256]
            while len(json.dumps(value)) > 100:
                value = value[:-1]
            return value

        # Registry candidates without a verified manifest are represented by
        # their raw installed entries in the public list.
        visible = [row for row in installed if row.get("pluginName")]
        page = [
            {
                "id": row.get("id"),
                "identityUnverified": bool(row.get("identityUnverified")),
                **{key: bounded(row.get(key)) for key in ("name", "repo", "version", "pluginName")},
            }
            for row in visible[offset : offset + 20]
        ]
        return {"plugins": page, "nextOffset": offset + 20 if offset + 20 < len(visible) else None}

    def remote(self, message, *, installed=None):
        result = self._remote(message, installed=installed)
        op = message["op"]
        if op != "pair" and not (op == "pair_status" and result["status"] != "approved"):
            result = {**result, **self.pins}
        return result

    def _remote(self, message, *, installed=None):
        if not isinstance(message, dict):
            raise ValueError("invalid request")
        op = message.get("op")
        if op == "pair":
            return self.pair(
                message.get("code"), message.get("name"), message.get("pairingSecret"), message.get("pairingToken")
            )
        if op == "pair_status":
            return self.pair_status(message.get("pairingId"), message.get("pairingSecret"))
        owner = self.owner(message.get("token"))
        if op == "plugins":
            return self._plugins_page(message, self.installed() if installed is None else installed)
        if op == "request":
            action = message.get("action", "install")
            if action not in ("install", "update", "uninstall"):
                raise ValueError("invalid action")
            plugin_id = message.get("pluginId")
            plugin_name = message.get("pluginName")
            by_name = plugin_id is None and action == "uninstall" and plugin_name is not None
            if not by_name and not isinstance(plugin_id, str):
                raise ValueError("plugin not in registry")
            key, tag = message.get("idempotencyKey"), message.get("releaseTag")
            previous = self.queue.retry(owner, key, None if by_name else plugin_id, tag, action, plugin_name)
            if previous:
                return {"requestId": previous.id, "status": previous.status}
            current = self.installed() if installed is None else installed
            snapshot = (
                self._snapshot_installed_name(plugin_name, current)
                if by_name
                else self._snapshot(plugin_id, action, current)
            )
            plugin_id = None if by_name else plugin_id
            r = self.queue.create(
                owner,
                key,
                plugin_id,
                tag,
                action=action,
                repository=snapshot[0],
                plugin_name=snapshot[1],
                installed_version=snapshot[2],
            )
            if self.devices[owner]["trusted"]:
                r = self.queue.transition_local(r.id, "approved")
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
        return [self._row(r) for r in self.queue.pending()]

    def list_trusted_requests(self):
        """Approved requests from trusted devices, for the device to run on its own."""
        return [self._row(r) for r in self.queue.approved() if self.devices.get(r.owner, {}).get("trusted")]

    def _row(self, r):
        return {
            "id": r.id,
            "pluginId": r.plugin_id,
            "releaseTag": r.release_tag,
            "action": r.action,
            "repo": r.repository,
            "pluginName": r.plugin_name,
            "installedVersion": r.installed_version,
            "ownerName": self.devices.get(r.owner, {}).get("name", "Revoked browser"),
            "status": r.status,
        }

    def decide_request(self, request_id, approve):
        if type(approve) is not bool:
            raise ValueError("invalid decision")
        r = self.queue.transition_local(request_id, "approved" if approve else "rejected")
        return {"id": r.id, "status": r.status}

    def claim(self, request_id, *, installed=None):
        r = self.queue.transition_local(request_id, "installing")
        try:
            current = self.installed() if installed is None else installed
            snapshot = (
                self._snapshot(r.plugin_id, r.action, current)
                if r.plugin_id
                else self._snapshot_installed_name(r.plugin_name, current)
            )
            if snapshot != (r.repository, r.plugin_name, r.installed_version):
                raise ValueError("installed plugin or registry changed")
        except ValueError:
            self.queue.transition_local(request_id, "failed")
            raise
        return {
            "id": r.id,
            "pluginId": r.plugin_id,
            "releaseTag": r.release_tag,
            "status": r.status,
            "action": r.action,
            "repo": r.repository,
            "pluginName": r.plugin_name,
            "installedVersion": r.installed_version,
        }

    def finish(self, request_id, success):
        if type(success) is not bool:
            raise ValueError("invalid outcome")
        request = self.queue.get_local(request_id)
        outcome = "uninstalled" if request and request.action == "uninstall" else "installed"
        r = self.queue.transition_local(request_id, outcome if success else "failed")
        return {"id": r.id, "status": r.status}

    def finish_unknown(self, request_id):
        r = self.queue.transition_local(request_id, "unknown")
        return {"id": r.id, "status": r.status}
