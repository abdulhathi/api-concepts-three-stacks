"""Concepts 23, 24, 25: the typed client's retries, timeouts and backoff."""

import asyncio
import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from bookshop_client import ApiError, BookshopClient, RetryEvent
from bookshop_client.client import backoff_ms
from tests.helpers import Stack, running

TOKEN = {"access_token": "t-1", "token_type": "Bearer", "expires_in": 900, "scope": "x"}


def problem(status: int, slug: str) -> httpx.Response:
    body = {
        "type": f"/problems/{slug}", "title": slug, "status": status, "detail": "d",
        "instance": "/v1/x", "requestId": "r",
    }  # fmt: skip
    return httpx.Response(status, json=body, headers={"content-type": "application/problem+json"})


class Script:
    """Fake server: hands out `responses` in order for API calls and counts everything."""

    def __init__(self, *responses: httpx.Response | Callable[[httpx.Request], Any]) -> None:
        self._responses = list(responses)
        self.calls: list[httpx.Request] = []
        self.token_requests = 0
        self.transport = httpx.MockTransport(self._handle)

    async def _handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/oauth/token":
            self.token_requests += 1
            return httpx.Response(200, json=TOKEN)
        self.calls.append(request)
        nxt = self._responses.pop(0)
        if callable(nxt):
            result = nxt(request)
            return await result if asyncio.iscoroutine(result) else result
        return nxt


def make_client(
    script: Script, sleeps: list[float], events: list[RetryEvent] | None = None, **opts
):
    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    return BookshopClient(
        "http://test", "reader", "reader-secret",
        transport=script.transport, sleep=fake_sleep, on_retry=(events.append if events is not None else None),
        jitter=lambda: 1.0, **opts,
    )  # fmt: skip


OK = httpx.Response(200, json={"id": "prd_01"})


async def test_23_safe_failures_are_retried_until_success():
    script = Script(problem(503, "service-unavailable"), problem(503, "service-unavailable"), OK)
    sleeps: list[float] = []
    events: list[RetryEvent] = []
    async with make_client(script, sleeps, events) as client:
        product = await client.get_product("prd_01")

    assert product["id"] == "prd_01"
    assert len(script.calls) == 3
    assert [e.reason for e in events] == ["HTTP 503", "HTTP 503"]
    assert all(c.headers["authorization"] == "Bearer t-1" for c in script.calls)


async def test_23_gives_up_after_three_retries_with_a_typed_error():
    script = Script(*(problem(503, "service-unavailable") for _ in range(4)))
    async with make_client(script, []) as client:
        with pytest.raises(ApiError) as caught:
            await client.get_product("prd_01")

    assert len(script.calls) == 4  # 1 try + 3 retries
    error = caught.value
    assert error.status == 503 and error.attempts == 4
    assert (
        error.slug == "service-unavailable" and error.problem and error.problem["requestId"] == "r"
    )


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 412, 422, 500])
async def test_23_other_errors_are_never_retried(status: int):
    script = Script(problem(status, "whatever"))
    async with make_client(script, []) as client:
        with pytest.raises(ApiError) as caught:
            await client.get_product("prd_01")
    assert len(script.calls) == 1 and caught.value.status == status


@pytest.mark.parametrize("status", [408, 429, 502, 503, 504])
async def test_23_every_retryable_status_is_retried(status: int):
    script = Script(problem(status, "x"), OK)
    async with make_client(script, []) as client:
        await client.get_product("prd_01")
    assert len(script.calls) == 2


async def test_23_post_without_an_idempotency_key_is_not_retried():
    script = Script(problem(503, "service-unavailable"), OK)
    async with make_client(script, []) as client:
        with pytest.raises(ApiError):
            await client.create_product("T", "A", 100)
    assert len(script.calls) == 1


async def test_23_create_order_retries_with_one_idempotency_key():
    script = Script(
        problem(503, "service-unavailable"),
        httpx.Response(504),
        httpx.Response(201, json={"id": "ord_1"}),
    )
    async with make_client(script, []) as client:
        order = await client.create_order([{"productId": "prd_01", "quantity": 1}])

    keys = {call.headers["idempotency-key"] for call in script.calls}
    assert order["id"] == "ord_1" and len(script.calls) == 3 and len(keys) == 1
    assert json.loads(script.calls[0].content) == {
        "items": [{"productId": "prd_01", "quantity": 1}]
    }


async def test_23_network_errors_are_retried():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    script = Script(refuse, OK)
    events: list[RetryEvent] = []
    async with make_client(script, [], events) as client:
        await client.get_product("prd_01")
    assert [e.reason for e in events] == ["ConnectError"]


async def test_23_token_is_cached_between_calls():
    script = Script(OK, OK, OK)
    async with make_client(script, []) as client:
        for _ in range(3):
            await client.get_product("prd_01")
    assert script.token_requests == 1


async def test_23_retry_after_header_overrides_the_backoff_schedule():
    limited = httpx.Response(
        429, json={}, headers={"Retry-After": "2", "content-type": "application/problem+json"}
    )
    script = Script(limited, OK)
    sleeps: list[float] = []
    async with make_client(script, sleeps) as client:
        await client.get_product("prd_01")
    assert sleeps == [2.0]  # not the ~0.2 s the backoff formula would give


async def test_24_each_attempt_has_its_own_timeout():
    async def hang(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return OK

    script = Script(hang, hang, OK)
    events: list[RetryEvent] = []
    async with make_client(script, [], events, attempt_timeout=0.05) as client:
        await client.get_product("prd_01")  # the third attempt answers in time
    assert [e.reason for e in events] == ["timeout", "timeout"]


async def test_24_timeouts_exhaust_into_an_api_error_without_a_problem():
    async def hang(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return OK

    script = Script(hang, hang)
    async with make_client(script, [], attempt_timeout=0.05, max_retries=1) as client:
        with pytest.raises(ApiError) as caught:
            await client.get_product("prd_01")
    assert (
        caught.value.attempts == 2 and caught.value.problem is None and caught.value.status is None
    )


def test_25_backoff_doubles_each_retry_and_is_capped():
    full, half = (lambda: 1.0), (lambda: 0.0)
    assert [backoff_ms(n, 200, 5000, full) for n in range(1, 8)] == [
        200,
        400,
        800,
        1600,
        3200,
        5000,
        5000,
    ]
    assert [backoff_ms(n, 200, 5000, half) for n in range(1, 4)] == [100, 200, 400]


async def test_25_client_waits_the_backoff_delays_between_retries():
    script = Script(*(problem(503, "x") for _ in range(3)), OK)
    sleeps: list[float] = []
    events: list[RetryEvent] = []
    async with make_client(script, sleeps, events, backoff_base_ms=100) as client:
        await client.get_product("prd_01")
    assert sleeps == [0.1, 0.2, 0.4]  # jitter pinned to 1.0 in make_client
    assert [e.delay_ms for e in events] == [100, 200, 400]


async def test_25_client_against_the_real_flaky_endpoint(stack: Stack):
    events: list[RetryEvent] = []
    async with BookshopClient(
        "http://test", "reader", "reader-secret", transport=httpx.ASGITransport(app=stack.app),
        backoff_base_ms=1, backoff_cap_ms=5, on_retry=events.append,
    ) as client:  # fmt: skip
        result = await client.flaky("integration-key", fail_times=2)
    assert result == {"key": "integration-key", "attempts": 3}
    assert [e.retry for e in events] == [1, 2]


async def test_23_client_honours_the_servers_429_retry_after():
    from tests.helpers import FakeClock

    clock = FakeClock()
    async with running(limiter_clock=clock) as stack:
        sleeps: list[float] = []

        async def advance_instead_of_sleeping(seconds: float) -> None:
            sleeps.append(seconds)
            clock.advance(seconds)

        async with BookshopClient(
            "http://test", "free", "free-secret", transport=httpx.ASGITransport(app=stack.app),
            sleep=advance_instead_of_sleeping,
        ) as client:  # fmt: skip
            for _ in range(5):
                await client.list_products(limit=1)
            page = await client.list_products(
                limit=1
            )  # 6th call: 429, Retry-After 12, then success
    assert sleeps == [12.0] and page["data"][0]["id"] == "prd_01"
