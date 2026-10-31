"""Concept 21 · Throttling: bounded concurrency with a bounded FIFO queue; beyond that, 503."""

import asyncio
from collections.abc import Awaitable, Callable

from app.web.problems import Problem


class ConcurrencyGate:
    """At most `max_running` jobs run, `max_waiting` more wait their turn, the rest are refused.

    `asyncio.Semaphore` wakes waiters in FIFO order. The extra `_waiting` counter is what lets
    us refuse immediately instead of letting the queue grow without bound.
    """

    def __init__(self, max_running: int = 2, max_waiting: int = 2) -> None:
        self._slots = asyncio.Semaphore(max_running)
        self._max_waiting = max_waiting
        self._waiting = 0

    async def run[T](self, work: Callable[[], Awaitable[T]]) -> T:
        if self._slots.locked():
            if self._waiting >= self._max_waiting:
                raise Problem(
                    "throttled",
                    "Too many reports are running. Try again shortly.",
                    headers={"Retry-After": "1"},
                )
            self._waiting += 1
            try:
                await self._slots.acquire()
            finally:
                self._waiting -= 1
        else:
            await self._slots.acquire()
        try:
            return await work()
        finally:
            self._slots.release()
