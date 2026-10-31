"""Concept 20 · Rate limiting: a token bucket per client, sized by plan, refilled continuously."""

import math
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    reset_seconds: int  # until one more token is available; 0 while tokens remain

    def headers(self) -> dict[str, str]:
        return {
            "RateLimit-Limit": str(self.limit),
            "RateLimit-Remaining": str(self.remaining),
            "RateLimit-Reset": str(self.reset_seconds),
        }

    @property
    def retry_after(self) -> int:
        return max(1, self.reset_seconds)


@dataclass(slots=True)
class _Bucket:
    tokens: float
    updated_at: float


class TokenBucketLimiter:
    """Per-process state; with many instances use a shared cache (ElastiCache/Redis)."""

    def __init__(
        self, plans: Mapping[str, int], clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._plans = plans
        self._clock = clock
        self._buckets: dict[str, _Bucket] = {}

    def check(self, client_id: str, plan: str) -> Decision:
        limit = self._plans[plan]
        refill_per_second = limit / 60
        now = self._clock()
        bucket = self._buckets.setdefault(client_id, _Bucket(float(limit), now))
        elapsed = max(0.0, now - bucket.updated_at)
        bucket.tokens = min(float(limit), bucket.tokens + elapsed * refill_per_second)
        bucket.updated_at = now

        allowed = bucket.tokens >= 1
        if allowed:
            bucket.tokens -= 1
        remaining = math.floor(bucket.tokens)
        reset = 0 if remaining > 0 else math.ceil((1 - bucket.tokens) / refill_per_second)
        return Decision(allowed, limit, remaining, reset)
