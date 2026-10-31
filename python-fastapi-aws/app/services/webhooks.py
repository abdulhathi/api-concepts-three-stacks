"""Concepts 25 and 26 · Webhooks: signed background deliveries, exponential backoff + jitter."""

import asyncio
import json
import random
import secrets
import time
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

import httpx

from app.ids import new_id
from app.models.webhooks import Delivery, EventType, Webhook
from app.repositories.webhooks import WebhookRepository
from app.timefmt import format_timestamp
from app.web.signature import sign

DELIVERY_TIMEOUT_SECONDS = 5.0
MAX_DELAY_MS = 60_000


def new_secret() -> str:
    return f"whsec_{secrets.token_hex(32)}"


def retry_delay_ms(retry: int, base_ms: int, jitter: Callable[[], float] = random.random) -> float:
    """random(0.5, 1.0) x min(60 s, base x 2^(retry-1)); jitter spreads retries out."""
    ceiling = min(MAX_DELAY_MS, base_ms * 2 ** (retry - 1))
    return float((0.5 + 0.5 * jitter()) * ceiling)


class WebhookDispatcher:
    def __init__(
        self,
        repo: WebhookRepository,
        http: httpx.AsyncClient,
        *,
        retry_base_ms: int,
        max_attempts: int,
        now: Callable[[], datetime],
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._repo = repo
        self._http = http
        self._retry_base_ms = retry_base_ms
        self._max_attempts = max_attempts
        self._now = now
        self._sleep = sleep
        self._tasks: set[asyncio.Task[None]] = set()

    async def publish(self, event_type: EventType, data: dict[str, Any]) -> None:
        """Record a pending delivery per subscriber and start delivering without waiting for it."""
        subscribers = await self._repo.listening_to(event_type)
        if not subscribers:
            return
        event_id = new_id("evt")
        body = json.dumps(
            {
                "id": event_id,
                "type": event_type,
                "createdAt": format_timestamp(self._now()),
                "data": data,
            },
            separators=(",", ":"),
        ).encode()
        for webhook in subscribers:
            now = self._now()
            delivery = Delivery(
                id=new_id("dlv"),
                subscription_id=webhook.id,
                event_id=event_id,
                event_type=event_type,
                created_at=now,
                updated_at=now,
            )
            await self._repo.add_delivery(delivery)
            # On Lambda this task freezes with the execution environment once the response is
            # returned; see "Production notes" in the README for the SQS-backed alternative.
            task = asyncio.create_task(self._deliver(webhook, delivery, body))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)

    async def drain(self) -> None:
        """Wait for in-flight deliveries (used by tests and graceful shutdown)."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks))

    async def _deliver(self, webhook: Webhook, delivery: Delivery, body: bytes) -> None:
        for attempt in range(1, self._max_attempts + 1):
            delivery.attempts = attempt
            await self._attempt(webhook, delivery, body)
            if delivery.status == "succeeded":
                return
            if attempt < self._max_attempts:
                await self._sleep(retry_delay_ms(attempt, self._retry_base_ms) / 1000)
        delivery.status = "failed"
        delivery.updated_at = self._now()

    async def _attempt(self, webhook: Webhook, delivery: Delivery, body: bytes) -> None:
        timestamp = int(time.time())
        headers = {
            "Content-Type": "application/json",
            "Webhook-Id": delivery.event_id,
            "Webhook-Timestamp": str(timestamp),
            "Webhook-Signature": sign(webhook.secret, timestamp, body),
        }
        try:
            response = await self._http.post(
                webhook.url, content=body, headers=headers, timeout=DELIVERY_TIMEOUT_SECONDS
            )
            delivery.last_status_code = response.status_code
            delivery.last_error = None if response.is_success else f"HTTP {response.status_code}"
        except httpx.HTTPError as exc:
            delivery.last_status_code = None
            delivery.last_error = f"{type(exc).__name__}: {exc}"[:200]
        if delivery.last_error is None:
            delivery.status = "succeeded"
        delivery.updated_at = self._now()
