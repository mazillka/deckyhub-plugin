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
_TERMINAL = frozenset({"rejected", "expired", "cancelled", "installed", "failed", "unknown"})


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
    plugin_id: str
    release_tag: str | None
    status: str
    expires_at: float
    updated_at: float


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
            if request.status == "pending_confirmation" and now >= request.expires_at:
                request = replace(request, status="expired", updated_at=now)
                self._requests[request_id] = request
            if request.status in _TERMINAL and now - request.updated_at >= self._retention:
                del self._requests[request_id]
        self._keys = {key: request_id for key, request_id in self._keys.items() if request_id in self._requests}

    def create(self, owner: str, key: str, plugin_id: str, release_tag: str | None = None) -> InstallRequest:
        if not isinstance(owner, str) or not _KEY.fullmatch(owner):
            raise ValueError("invalid owner")
        if not isinstance(key, str) or not _KEY.fullmatch(key):
            raise ValueError("invalid idempotency key")
        if not isinstance(plugin_id, str) or not _ID.fullmatch(plugin_id):
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
                if (previous.plugin_id, previous.release_tag) != (plugin_id, release_tag):
                    raise RequestConflictError("idempotency key already used")
                return previous
            if len(self._requests) >= self._capacity:
                raise QueueFullError("request queue is full")
            request_id = secrets.token_urlsafe(24)
            while request_id in self._requests:
                request_id = secrets.token_urlsafe(24)
            request = InstallRequest(
                request_id, owner, plugin_id, release_tag, "pending_confirmation", now + self._ttl, now
            )
            self._requests[request_id] = request
            self._keys[(owner, key)] = request_id
            return request

    def get(self, owner: str, request_id: str) -> InstallRequest | None:
        with self._lock:
            self._sweep(self._clock())
            request = self._requests.get(request_id)
            return request if request is not None and request.owner == owner else None

    def pending(self) -> tuple[InstallRequest, ...]:
        """For the local approval UI, not a remote owner-scoped API."""
        with self._lock:
            self._sweep(self._clock())
            return tuple(request for request in self._requests.values() if request.status == "pending_confirmation")

    def cancel(self, owner: str, request_id: str) -> InstallRequest | None:
        with self._lock:
            now = self._clock()
            self._sweep(now)
            request = self._requests.get(request_id)
            if request is None or request.owner != owner:
                return None
            return self._transition(request, "cancelled", {"pending_confirmation"}, now)

    def cancel_owner_pending(self, owner: str) -> None:
        """Revocation cancels unclaimed work; a running installer cannot be undone."""
        with self._lock:
            now = self._clock()
            self._sweep(now)
            for request in tuple(self._requests.values()):
                if request.owner == owner and request.status == "pending_confirmation":
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
            "unknown": {"installing"},
        }
        if status not in allowed:
            raise InvalidTransitionError("unsupported transition")
        with self._lock:
            now = self._clock()
            self._sweep(now)
            request = self._requests[request_id]
            if status == "installing" and any(r.status == "installing" for r in self._requests.values()):
                raise InvalidTransitionError("another installation is active")
            return self._transition(request, status, allowed[status], now)

    def _transition(self, request: InstallRequest, status: str, allowed: set[str], now: float) -> InstallRequest:
        if request.status not in allowed:
            raise InvalidTransitionError(f"cannot transition from {request.status} to {status}")
        updated = replace(request, status=status, updated_at=now)
        self._requests[request.id] = updated
        return updated
