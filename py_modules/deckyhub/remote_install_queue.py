"""Unexposed, in-memory remote install request state.

Callers must authenticate owners, resolve plugin IDs against the registry and perform
Deck-side approval before invoking the corresponding methods. This module never
starts an installation or survives a plugin restart.
"""

import re
import secrets
import threading
import time
from dataclasses import dataclass, replace
from typing import Callable

_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,127}\Z")
_TAG = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+/-]{0,127}\Z")
_KEY = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")
# How long a claimed request may stay "installing" before its outcome is called unknown.
# The claim only covers the download and the handover to Decky Loader, never the install itself.
INSTALLING_SECONDS = 15 * 60
MAX_TOGGLE_PLUGINS = 50
_ACTIONS = ("install", "update", "uninstall", "enable", "disable")
_TERMINAL = frozenset(
    {"rejected", "expired", "cancelled", "installed", "uninstalled", "enabled", "disabled", "failed", "unknown"}
)


class QueueFullError(Exception):
    """All request slots are occupied."""


class RequestConflictError(Exception):
    """An idempotency key was reused for different request data."""


class InvalidTransitionError(Exception):
    """A request cannot make the requested transition."""


@dataclass(frozen=True)
class InstallRequest:
    id: str
    owner: str
    plugin_id: str | None
    release_tag: str | None
    status: str
    expires_at: float
    updated_at: float
    action: str = "install"
    repository: str | None = None
    plugin_name: str | None = None
    installed_version: str | None = None
    # enable / disable: the Decky Loader names of the plugins to switch, one request for a whole pack.
    plugin_names: tuple[str, ...] = ()


class RemoteInstallQueue:
    """Thread-safe state machine. IDs and timestamps are process-local."""

    def __init__(
        self,
        *,
        capacity: int = 64,
        ttl: float = 120,
        retention: float = 600,
        clock: Callable[[], float] = time.monotonic,
    ):
        if capacity < 1 or ttl <= 0 or retention <= 0:
            raise ValueError("capacity, ttl and retention must be positive")
        self._capacity, self._ttl, self._retention, self._clock = capacity, ttl, retention, clock
        self._lock = threading.Lock()
        self._requests: dict[str, InstallRequest] = {}
        self._keys: dict[tuple[str, str], str] = {}

    def _sweep(self, now: float) -> None:
        for request_id, request in list(self._requests.items()):
            # An approved request that nobody started (say the device was in Desktop Mode)
            # must not run later; its expiry is restarted when it is approved.
            if request.status in ("pending_confirmation", "approved") and now >= request.expires_at:
                request = replace(request, status="expired", updated_at=now)
                self._requests[request_id] = request
            # The frontend that claimed it never reported back (the Steam UI reloaded, say):
            # without this it would block every later request as "another installation is active".
            elif request.status == "installing" and now - request.updated_at >= INSTALLING_SECONDS:
                request = replace(request, status="unknown", updated_at=now)
                self._requests[request_id] = request
            if request.status in _TERMINAL and now - request.updated_at >= self._retention:
                del self._requests[request_id]
        self._keys = {key: request_id for key, request_id in self._keys.items() if request_id in self._requests}

    def create(
        self,
        owner: str,
        key: str,
        plugin_id: str | None,
        release_tag: str | None = None,
        *,
        action: str = "install",
        repository: str | None = None,
        plugin_name: str | None = None,
        installed_version: str | None = None,
        plugin_names: tuple[str, ...] = (),
    ) -> InstallRequest:
        if action not in _ACTIONS:
            raise ValueError("invalid action")
        if action in ("uninstall", "enable", "disable") and release_tag is not None:
            raise ValueError(f"{action} cannot select a release")
        toggle = action in ("enable", "disable")
        if toggle:
            if not (
                isinstance(plugin_names, tuple)
                and 0 < len(plugin_names) <= MAX_TOGGLE_PLUGINS
                and all(isinstance(n, str) and 0 < len(n) <= 100 for n in plugin_names)
            ):
                raise ValueError("invalid plugin names")
        elif plugin_names:
            raise ValueError("only enable and disable take plugin names")
        if not isinstance(owner, str) or not _KEY.fullmatch(owner):
            raise ValueError("invalid owner")
        if not isinstance(key, str) or not _KEY.fullmatch(key):
            raise ValueError("invalid idempotency key")
        if toggle:
            if plugin_id is not None:
                raise ValueError("invalid plugin ID")
        elif plugin_id is None:
            # An installed plugin outside the registry can only be uninstalled, by its own name.
            if action != "uninstall" or not isinstance(plugin_name, str) or not plugin_name:
                raise ValueError("invalid plugin ID")
        elif not isinstance(plugin_id, str) or not _ID.fullmatch(plugin_id):
            raise ValueError("invalid plugin ID")
        if release_tag is not None and (
            not isinstance(release_tag, str)
            or not _TAG.fullmatch(release_tag)
            or ".." in release_tag
            or "//" in release_tag
            or release_tag.endswith("/")
        ):
            raise ValueError("invalid release tag")
        with self._lock:
            now = self._clock()
            self._sweep(now)
            previous_id = self._keys.get((owner, key))
            if previous_id is not None:
                previous = self._requests[previous_id]
                if (
                    previous.plugin_id,
                    previous.release_tag,
                    previous.action,
                    previous.repository,
                    previous.plugin_name,
                    previous.installed_version,
                    previous.plugin_names,
                ) != (plugin_id, release_tag, action, repository, plugin_name, installed_version, plugin_names):
                    raise RequestConflictError("idempotency key already used")
                return previous
            if len(self._requests) >= self._capacity:
                raise QueueFullError("request queue is full")
            request_id = secrets.token_urlsafe(24)
            while request_id in self._requests:
                request_id = secrets.token_urlsafe(24)
            request = InstallRequest(
                request_id,
                owner,
                plugin_id,
                release_tag,
                "pending_confirmation",
                now + self._ttl,
                now,
                action,
                repository,
                plugin_name,
                installed_version,
                plugin_names,
            )
            self._requests[request_id] = request
            self._keys[(owner, key)] = request_id
            return request

    def get(self, owner: str, request_id: str) -> InstallRequest | None:
        with self._lock:
            self._sweep(self._clock())
            request = self._requests.get(request_id)
            return request if request is not None and request.owner == owner else None

    def retry(
        self,
        owner: str,
        key: str,
        plugin_id: str | None,
        release_tag: str | None,
        action: str,
        plugin_name: str | None = None,
        plugin_names: tuple[str, ...] = (),
    ) -> InstallRequest | None:
        if not isinstance(key, str) or not _KEY.fullmatch(key):
            raise ValueError("invalid idempotency key")
        with self._lock:
            self._sweep(self._clock())
            request_id = self._keys.get((owner, key))
            if request_id is None:
                return None
            request = self._requests[request_id]
            if (
                (request.plugin_id, request.release_tag, request.action) != (plugin_id, release_tag, action)
                or (
                    plugin_id is None
                    and action == "uninstall"
                    and str(request.plugin_name).casefold() != str(plugin_name).casefold()
                )
                or tuple(n.casefold() for n in request.plugin_names) != tuple(n.casefold() for n in plugin_names)
            ):
                raise RequestConflictError("idempotency key already used")
            return request

    def get_local(self, request_id: str) -> InstallRequest:
        with self._lock:
            self._sweep(self._clock())
            return self._known(request_id)

    def pending(self) -> tuple[InstallRequest, ...]:
        """For the local approval UI, not a remote owner-scoped API."""
        with self._lock:
            self._sweep(self._clock())
            return tuple(request for request in self._requests.values() if request.status == "pending_confirmation")

    def approved(self) -> tuple[InstallRequest, ...]:
        """Requests waiting for this device to run them, for its local runner."""
        with self._lock:
            self._sweep(self._clock())
            return tuple(request for request in self._requests.values() if request.status == "approved")

    def cancel(self, owner: str, request_id: str) -> InstallRequest | None:
        with self._lock:
            now = self._clock()
            self._sweep(now)
            request = self._requests.get(request_id)
            if request is None or request.owner != owner:
                return None
            return self._transition(request, "cancelled", {"pending_confirmation"}, now)

    def cancel_owner_pending(self, owner: str, *, approved_only: bool = False) -> None:
        """Revocation or lost trust cancels unclaimed work; a running installer cannot be undone."""
        with self._lock:
            now = self._clock()
            self._sweep(now)
            for request in tuple(self._requests.values()):
                if request.owner == owner and request.status == "pending_confirmation" and not approved_only:
                    self._transition(request, "cancelled", {"pending_confirmation"}, now)
                elif request.owner == owner and request.status == "approved":
                    self._transition(request, "failed", {"approved"}, now)

    def transition_local(self, request_id: str, status: str) -> InstallRequest:
        """Local-only transition after Deck approval, or observed installer outcome."""
        allowed = {
            "approved": {"pending_confirmation"},
            "rejected": {"pending_confirmation"},
            "installing": {"approved"},
            "failed": {"approved", "installing"},
            "installed": {"installing"},
            "uninstalled": {"installing"},
            "enabled": {"installing"},
            "disabled": {"installing"},
            "unknown": {"installing"},
        }
        if status not in allowed:
            raise InvalidTransitionError("unsupported transition")
        with self._lock:
            now = self._clock()
            self._sweep(now)
            request = self._known(request_id)
            if status == "installing" and any(r.status == "installing" for r in self._requests.values()):
                raise InvalidTransitionError("another installation is active")
            updated = self._transition(request, status, allowed[status], now)
            if status == "approved":
                updated = replace(updated, expires_at=now + self._ttl)
                self._requests[request_id] = updated
            return updated

    def _known(self, request_id: str) -> InstallRequest:
        # Swept away or never there: the same error as any other step that can't be taken.
        request = self._requests.get(request_id) if isinstance(request_id, str) else None
        if request is None:
            raise InvalidTransitionError("request not found")
        return request

    def _transition(self, request: InstallRequest, status: str, allowed: set[str], now: float) -> InstallRequest:
        if request.status not in allowed:
            raise InvalidTransitionError(f"cannot transition from {request.status} to {status}")
        updated = replace(request, status=status, updated_at=now)
        self._requests[request.id] = updated
        return updated
