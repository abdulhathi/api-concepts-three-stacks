"""Concept 22 · Idempotency: remember the first 201 for (client, key) for 24 hours."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

TTL = timedelta(hours=24)


@dataclass(frozen=True, slots=True)
class StoredResponse:
    status: int
    body: bytes
    location: str


@dataclass(frozen=True, slots=True)
class Started:
    """First time we see this key: the caller must process, then `complete` or `release`."""


@dataclass(frozen=True, slots=True)
class Replay:
    response: StoredResponse


@dataclass(frozen=True, slots=True)
class InProgress:
    """The first request with this key has not finished yet."""


@dataclass(frozen=True, slots=True)
class Reused:
    """Same key, different request body."""


Outcome = Started | Replay | InProgress | Reused


@dataclass(slots=True)
class _Entry:
    body_hash: str
    expires_at: datetime
    response: StoredResponse | None = None


class InMemoryIdempotencyStore:
    """`begin` is synchronous on purpose: with no await inside, check-and-claim is atomic.

    A shared store (DynamoDB conditional put, Redis SET NX) does the same across instances.
    """

    def __init__(self, now: Callable[[], datetime]) -> None:
        self._now = now
        self._entries: dict[tuple[str, str], _Entry] = {}

    def begin(self, client_id: str, key: str, body_hash: str) -> Outcome:
        slot = (client_id, key)
        entry = self._entries.get(slot)
        if entry is not None and entry.expires_at <= self._now():
            del self._entries[slot]
            entry = None
        if entry is None:
            self._entries[slot] = _Entry(body_hash, self._now() + TTL)
            return Started()
        if entry.response is None:
            return InProgress()
        if entry.body_hash != body_hash:
            return Reused()
        return Replay(entry.response)

    def complete(self, client_id: str, key: str, response: StoredResponse) -> None:
        self._entries[(client_id, key)].response = response

    def release(self, client_id: str, key: str) -> None:
        """The first attempt failed: forget the key so the client can retry it."""
        self._entries.pop((client_id, key), None)
