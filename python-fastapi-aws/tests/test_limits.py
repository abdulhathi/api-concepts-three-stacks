"""Concepts 20, 21, 24: rate limiting, throttling and the server-side timeout."""

import asyncio
import time

from app.config import Settings
from tests.helpers import FakeClock, Stack, running


async def test_20_rate_limit_returns_429_with_retry_after():
    clock = FakeClock()
    async with running(limiter_clock=clock) as stack:
        headers = await stack.auth("free")  # 5 requests per minute
        statuses = [
            (await stack.http.get("/v1/products", headers=headers)).status_code for _ in range(5)
        ]
        blocked = await stack.http.get("/v1/products", headers=headers)

    assert statuses == [200] * 5
    assert blocked.status_code == 429
    assert blocked.json()["type"] == "/problems/rate-limited"
    assert blocked.headers["retry-after"] == "12"  # 60 s / 5 tokens
    assert blocked.headers["ratelimit-limit"] == "5"
    assert blocked.headers["ratelimit-remaining"] == "0"
    assert blocked.headers["ratelimit-reset"] == "12"


async def test_20_ratelimit_headers_count_down_on_every_authenticated_response():
    async with running(limiter_clock=FakeClock()) as stack:
        headers = await stack.auth("free")
        remaining = []
        for _ in range(3):
            response = await stack.http.get("/v1/products", headers=headers)
            remaining.append(response.headers["ratelimit-remaining"])
            assert response.headers["ratelimit-limit"] == "5"
        forbidden = await stack.http.post("/v1/products", json={}, headers=headers)

    assert remaining == ["4", "3", "2"]
    assert forbidden.status_code == 403 and forbidden.headers["ratelimit-remaining"] == "1"


async def test_20_bucket_refills_continuously_and_is_per_client():
    clock = FakeClock()
    async with running(limiter_clock=clock) as stack:
        free = await stack.auth("free")
        for _ in range(5):
            await stack.http.get("/v1/products", headers=free)
        assert (await stack.http.get("/v1/products", headers=free)).status_code == 429

        clock.advance(11)  # not yet one whole token
        assert (await stack.http.get("/v1/products", headers=free)).status_code == 429
        clock.advance(1)
        assert (await stack.http.get("/v1/products", headers=free)).status_code == 200

        reader = await stack.auth("reader")  # a different client has its own full bucket
        response = await stack.http.get("/v1/products", headers=reader)
        assert response.headers["ratelimit-limit"] == "1000"
        assert response.headers["ratelimit-remaining"] == "999"


async def test_20_unauthenticated_and_health_requests_are_not_counted():
    async with running(limiter_clock=FakeClock()) as stack:
        headers = await stack.auth("free")
        for _ in range(10):
            await stack.http.get("/v1/products")  # 401
            await stack.http.get("/health")
        response = await stack.http.get("/v1/products", headers=headers)
        assert response.headers["ratelimit-remaining"] == "4"
        assert "ratelimit-limit" not in (await stack.http.get("/health")).headers


async def test_21_report_queue_runs_two_queues_two_and_rejects_the_rest():
    async with running() as stack:
        headers = await stack.auth("reader")

        async def call() -> tuple[int, float, dict[str, str]]:
            started = time.perf_counter()
            response = await stack.http.get("/v1/reports/sales?delayMs=400", headers=headers)
            return response.status_code, time.perf_counter() - started, dict(response.headers)

        results = await asyncio.gather(*(call() for _ in range(6)))

    ok = sorted(r for r in results if r[0] == 200)
    rejected = [r for r in results if r[0] == 503]
    assert len(ok) == 4 and len(rejected) == 2
    # Two ran right away (~0.4 s); the two that waited finished after a second round (~0.8 s).
    first_round, second_round = ok[:2], ok[2:]
    assert all(0.35 < r[1] < 0.7 for r in first_round)
    assert all(0.75 < r[1] < 1.3 for r in second_round)
    for _, elapsed, response_headers in rejected:
        assert elapsed < 0.2  # refused immediately, not after waiting
        assert response_headers["retry-after"] == "1"


async def test_21_throttled_response_is_a_problem(stack: Stack):
    headers = await stack.auth("reader")
    calls = [stack.http.get("/v1/reports/sales?delayMs=300", headers=headers) for _ in range(5)]
    responses = await asyncio.gather(*calls)
    body = next(r for r in responses if r.status_code == 503).json()
    assert body["type"] == "/problems/throttled" and body["status"] == 503


async def test_21_report_totals_only_paid_orders(stack: Stack):
    writer = await stack.auth("writer")
    items = {"items": [{"productId": "prd_01", "quantity": 2}]}  # 2 x 3499
    first = await stack.http.post(
        "/v1/orders", json=items, headers={**writer, "Idempotency-Key": "a"}
    )
    await stack.http.post("/v1/orders", json=items, headers={**writer, "Idempotency-Key": "b"})
    await stack.http.post(f"/v1/orders/{first.json()['id']}/pay", headers=writer)

    report = await stack.http.get("/v1/reports/sales?delayMs=0", headers=writer)
    body = report.json()
    assert (body["orderCount"], body["paidCount"], body["revenueCents"]) == (2, 1, 6998)
    assert body["generatedAt"].endswith("Z")


async def test_24_slow_report_is_cancelled_with_504_at_the_deadline():
    async with running(Settings(request_timeout_ms=200)) as stack:
        started = time.perf_counter()
        response = await stack.http.get(
            "/v1/reports/sales?delayMs=3000", headers=await stack.auth("reader")
        )
        elapsed = time.perf_counter() - started

        assert response.status_code == 504
        assert response.json()["type"] == "/problems/timeout"
        assert 0.15 < elapsed < 0.6
        # The cancelled job released its slot, so the next report is not throttled.
        fast = await stack.http.get(
            "/v1/reports/sales?delayMs=10", headers=await stack.auth("reader")
        )
        assert fast.status_code == 200


async def test_24_delay_ms_is_validated(stack: Stack):
    response = await stack.http.get(
        "/v1/reports/sales?delayMs=10001", headers=await stack.auth("reader")
    )
    assert response.status_code == 400 and response.json()["errors"][0]["field"] == "delayMs"
