"""Concept 26 (signing and delivery) and concept 25 (webhook backoff)."""

import asyncio
import hashlib
import hmac
import json
import re
import time
from typing import Any

import httpx
import pytest

from app.services.webhooks import retry_delay_ms
from app.web.signature import InvalidSignature, sign, verify_signature
from tests.helpers import TEST_SETTINGS, Stack, running

ORDER = {"items": [{"productId": "prd_01", "quantity": 1}]}


class Receiver:
    """A fake webhook endpoint (httpx MockTransport): fails the first `fail_first` calls."""

    def __init__(self, fail_first: int = 0, status: int = 500) -> None:
        self.requests: list[httpx.Request] = []
        self._fail_first = fail_first
        self._status = status
        self.transport = httpx.MockTransport(self._handle)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self._status if len(self.requests) <= self._fail_first else 204)


async def subscribe(stack: Stack, events: list[str]) -> dict[str, Any]:
    response = await stack.http.post(
        "/v1/webhooks",
        json={"url": "https://receiver.example/hook", "events": events},
        headers=await stack.auth("admin"),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_order(stack: Stack, key: str = "k") -> dict[str, Any]:
    response = await stack.http.post(
        "/v1/orders", json=ORDER, headers={**await stack.auth("writer"), "Idempotency-Key": key}
    )
    return response.json()


async def deliveries(stack: Stack, webhook_id: str) -> list[dict[str, Any]]:
    response = await stack.http.get(
        f"/v1/webhooks/{webhook_id}/deliveries", headers=await stack.auth("admin")
    )
    return response.json()["data"]


async def test_26_subscription_secret_is_shown_once_and_admin_only(stack: Stack):
    hook = await subscribe(stack, ["order.created", "order.paid"])
    assert re.fullmatch(r"whk_[0-9a-f]{12}", hook["id"])
    assert re.fullmatch(r"whsec_[0-9a-f]{64}", hook["secret"])

    admin = await stack.auth("admin")
    listed = (await stack.http.get("/v1/webhooks", headers=admin)).json()["data"]
    assert [h["id"] for h in listed] == [hook["id"]] and "secret" not in listed[0]

    assert (
        await stack.http.get("/v1/webhooks", headers=await stack.auth("writer"))
    ).status_code == 403
    assert (await stack.http.delete(f"/v1/webhooks/{hook['id']}", headers=admin)).status_code == 204
    assert (await stack.http.delete(f"/v1/webhooks/{hook['id']}", headers=admin)).status_code == 404


async def test_26_subscription_validation(stack: Stack):
    admin = await stack.auth("admin")
    for body in (
        {"url": "ftp://x", "events": ["order.paid"]},
        {"url": "https://x.example", "events": []},
        {"url": "https://x.example", "events": ["order.exploded"]},
    ):
        response = await stack.http.post("/v1/webhooks", json=body, headers=admin)
        assert response.status_code == 400


async def test_26_delivery_is_signed_and_verifiable_by_the_receiver():
    receiver = Receiver()
    async with running(webhook_transport=receiver.transport) as stack:
        hook = await subscribe(stack, ["order.created"])
        order = await create_order(stack)
        await stack.container.dispatcher.drain()

    (request,) = receiver.requests
    body = request.content
    event = json.loads(body)
    assert event["type"] == "order.created" and re.fullmatch(r"evt_[0-9a-f]{12}", event["id"])
    assert event["data"]["order"]["id"] == order["id"]

    assert request.headers["content-type"] == "application/json"
    assert request.headers["webhook-id"] == event["id"]
    timestamp = request.headers["webhook-timestamp"]
    expected = hmac.new(hook["secret"].encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    assert request.headers["webhook-signature"] == f"v1={expected.hexdigest()}"
    verify_signature(hook["secret"], body, timestamp, request.headers["webhook-signature"])


async def test_26_only_subscribed_event_types_are_delivered():
    receiver = Receiver()
    async with running(webhook_transport=receiver.transport) as stack:
        await subscribe(stack, ["order.paid"])
        order = await create_order(stack)
        await stack.container.dispatcher.drain()
        assert receiver.requests == []

        await stack.http.post(f"/v1/orders/{order['id']}/pay", headers=await stack.auth("writer"))
        await stack.container.dispatcher.drain()
        assert json.loads(receiver.requests[0].content)["type"] == "order.paid"


async def test_26_failed_delivery_is_retried_and_logged():
    receiver = Receiver(fail_first=2, status=500)
    async with running(webhook_transport=receiver.transport) as stack:
        hook = await subscribe(stack, ["order.created"])
        await create_order(stack)

        (pending,) = await deliveries(stack, hook["id"])
        # The order response did not wait for delivery: the log shows it still retrying.
        assert pending["status"] == "pending" and pending["attempts"] < 3

        await stack.container.dispatcher.drain()
        (done,) = await deliveries(stack, hook["id"])

    assert len(receiver.requests) == 3
    assert done["status"] == "succeeded" and done["attempts"] == 3
    assert done["lastStatusCode"] == 204 and done["lastError"] is None
    assert done["eventType"] == "order.created" and done["eventId"].startswith("evt_")
    assert set(done) == {
        "id", "eventId", "eventType", "status", "attempts", "lastStatusCode", "lastError",
        "createdAt", "updatedAt",
    }  # fmt: skip


async def test_26_delivery_gives_up_after_the_maximum_attempts():
    receiver = Receiver(fail_first=99, status=503)
    async with running(webhook_transport=receiver.transport) as stack:
        hook = await subscribe(stack, ["order.created"])
        await create_order(stack)
        await stack.container.dispatcher.drain()
        (log,) = await deliveries(stack, hook["id"])

    assert len(receiver.requests) == TEST_SETTINGS.webhook_max_attempts == 5
    assert (log["status"], log["attempts"], log["lastStatusCode"], log["lastError"]) == (
        "failed", 5, 503, "HTTP 503",
    )  # fmt: skip


async def test_26_network_errors_are_recorded_and_retried():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    async with running(webhook_transport=httpx.MockTransport(refuse)) as stack:
        hook = await subscribe(stack, ["order.created"])
        await create_order(stack)
        await stack.container.dispatcher.drain()
        (log,) = await deliveries(stack, hook["id"])
    assert log["status"] == "failed" and log["lastStatusCode"] is None
    assert "ConnectError" in log["lastError"]


async def test_26_replayed_order_creation_emits_no_second_event():
    receiver = Receiver()
    async with running(webhook_transport=receiver.transport) as stack:
        await subscribe(stack, ["order.created"])
        await create_order(stack, "same")
        await create_order(stack, "same")
        await stack.container.dispatcher.drain()
    assert len(receiver.requests) == 1


async def test_26_paying_twice_emits_one_event():
    receiver = Receiver()
    async with running(webhook_transport=receiver.transport) as stack:
        await subscribe(stack, ["order.paid"])
        order = await create_order(stack)
        writer = await stack.auth("writer")
        for _ in range(2):
            await stack.http.post(f"/v1/orders/{order['id']}/pay", headers=writer)
        await stack.container.dispatcher.drain()
    assert len(receiver.requests) == 1


def test_26_verify_signature_rejects_tampering_and_stale_timestamps():
    secret, body, now = "whsec_" + "ab" * 32, b'{"id":"evt_1"}', int(time.time())
    good = sign(secret, now, body)
    verify_signature(secret, body, str(now), good)

    with pytest.raises(InvalidSignature, match="does not match"):
        verify_signature(secret, b'{"id":"evt_2"}', str(now), good)
    with pytest.raises(InvalidSignature, match="does not match"):
        verify_signature("whsec_other", body, str(now), good)
    with pytest.raises(InvalidSignature, match="window"):
        stale = now - 301
        verify_signature(secret, body, str(stale), sign(secret, stale, body))
    with pytest.raises(InvalidSignature, match="window"):
        verify_signature(secret, body, str(now + 301), sign(secret, now + 301, body))
    verify_signature(secret, body, str(now - 299), sign(secret, now - 299, body))
    with pytest.raises(InvalidSignature, match="number"):
        verify_signature(secret, body, "yesterday", good)


def test_25_webhook_retry_delay_doubles_with_jitter_and_is_capped():
    low, high = (lambda: 0.0), (lambda: 1.0)
    # jitter factor is random(0.5, 1.0): 0.5 at the low end, 1.0 at the high end
    assert [retry_delay_ms(n, 500, low) for n in (1, 2, 3, 4)] == [250, 500, 1000, 2000]
    assert [retry_delay_ms(n, 500, high) for n in (1, 2, 3, 4)] == [500, 1000, 2000, 4000]
    assert retry_delay_ms(20, 500, high) == 60_000


async def test_25_dispatcher_sleeps_with_growing_delays_between_attempts():
    delays: list[float] = []

    async def record_sleep(seconds: float) -> None:
        delays.append(seconds)
        await asyncio.sleep(0)

    receiver = Receiver(fail_first=99)
    async with running(webhook_transport=receiver.transport, webhook_sleep=record_sleep) as stack:
        await subscribe(stack, ["order.created"])
        await create_order(stack)
        await stack.container.dispatcher.drain()

    assert len(delays) == 4  # between 5 attempts
    for n, seconds in enumerate(delays, start=1):
        ceiling_ms = 5 * 2 ** (n - 1)  # TEST_SETTINGS.webhook_retry_base_ms = 5
        assert ceiling_ms * 0.5 <= seconds * 1000 <= ceiling_ms
