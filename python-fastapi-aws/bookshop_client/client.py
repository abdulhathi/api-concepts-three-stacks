"""Concepts 23, 24, 25 · Typed client: retries, per-attempt timeout, exponential backoff."""

import asyncio
import random
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Self, cast

import httpx

from bookshop_client.errors import ApiError
from bookshop_client.types import Order, Problem, Product, ProductPage

RETRYABLE_STATUSES = frozenset({408, 429, 502, 503, 504})
IDEMPOTENT_METHODS = frozenset({"GET", "HEAD", "PUT", "DELETE", "OPTIONS"})
TOKEN_REFRESH_MARGIN_SECONDS = 30


@dataclass(frozen=True, slots=True)
class RetryEvent:
    """Reported to `on_retry` before each wait, e.g. for logging."""

    retry: int  # 1 for the first retry
    delay_ms: float
    reason: str  # "HTTP 503", "timeout", "ConnectError", ...


def backoff_ms(retry: int, base_ms: float, cap_ms: float, jitter: Callable[[], float]) -> float:
    """random(0.5, 1.0) x min(cap, base x 2^(retry-1)): exponential growth with jitter."""
    return float((0.5 + 0.5 * jitter()) * min(cap_ms, base_ms * 2 ** (retry - 1)))


class BookshopClient:
    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        *,
        attempt_timeout: float = 5.0,
        max_retries: int = 3,
        backoff_base_ms: float = 200,
        backoff_cap_ms: float = 5000,
        transport: httpx.AsyncBaseTransport | None = None,
        on_retry: Callable[[RetryEvent], None] | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        jitter: Callable[[], float] = random.random,
    ) -> None:
        self._http = httpx.AsyncClient(base_url=base_url, transport=transport)
        self._credentials = (client_id, client_secret)
        self._attempt_timeout = attempt_timeout
        self._max_retries = max_retries
        self._base_ms = backoff_base_ms
        self._cap_ms = backoff_cap_ms
        self._on_retry = on_retry
        self._sleep = sleep
        self._jitter = jitter
        self._token: str | None = None
        self._token_valid_until = 0.0  # time.monotonic() value

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self._http.aclose()

    # --- typed operations -------------------------------------------------------------------

    async def list_products(
        self, *, limit: int = 10, cursor: str | None = None, tag: str | None = None
    ) -> ProductPage:
        params = {"limit": limit, "cursor": cursor, "tag": tag}
        return cast(ProductPage, await self.request("GET", "/v1/products", params=params))

    async def get_product(self, product_id: str) -> Product:
        return cast(Product, await self.request("GET", f"/v1/products/{product_id}"))

    async def create_product(
        self, title: str, author: str, price_cents: int, tags: list[str] | None = None
    ) -> Product:
        body = {"title": title, "author": author, "priceCents": price_cents, "tags": tags or []}
        return cast(Product, await self.request("POST", "/v1/products", json=body))

    async def create_order(self, items: list[dict[str, Any]]) -> Order:
        """One Idempotency-Key per call, reused on every retry: a retry cannot double-order."""
        headers = {"Idempotency-Key": str(uuid.uuid4())}
        body = {"items": items}
        return cast(Order, await self.request("POST", "/v1/orders", json=body, headers=headers))

    async def pay_order(self, order_id: str) -> Order:
        return cast(Order, await self.request("POST", f"/v1/orders/{order_id}/pay"))

    async def flaky(self, key: str, fail_times: int = 2) -> dict[str, Any]:
        params = {"key": key, "failTimes": fail_times}
        result = await self.request("GET", "/v1/demo/flaky", params=params)
        return cast(dict[str, Any], result)

    # --- plumbing ---------------------------------------------------------------------------

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        method = method.upper()
        params = {k: v for k, v in (params or {}).items() if v is not None}
        retryable_method = method in IDEMPOTENT_METHODS or bool(
            headers and "Idempotency-Key" in headers
        )
        attempts = 0
        while True:
            attempts += 1
            reason, retry_after = "", None
            try:
                response = await self._send_once(method, path, params, json, headers)
            except (httpx.TransportError, TimeoutError) as exc:
                if not retryable_method or attempts > self._max_retries:
                    raise ApiError(
                        f"{method} {path} failed: {type(exc).__name__}", attempts=attempts
                    ) from exc
                reason = "timeout" if isinstance(exc, TimeoutError) else type(exc).__name__
            else:
                if response.is_success:
                    return None if response.status_code == 204 else response.json()
                problem = self._problem_of(response)
                if (
                    response.status_code not in RETRYABLE_STATUSES
                    or not retryable_method
                    or attempts > self._max_retries
                ):
                    raise ApiError(
                        f"{method} {path} failed with {response.status_code}"
                        + (f": {problem['detail']}" if problem else ""),
                        status=response.status_code,
                        problem=problem,
                        attempts=attempts,
                    )
                reason = f"HTTP {response.status_code}"
                retry_after = self._retry_after_seconds(response)

            delay_ms = (
                retry_after * 1000
                if retry_after is not None
                else backoff_ms(attempts, self._base_ms, self._cap_ms, self._jitter)
            )
            if self._on_retry:
                self._on_retry(RetryEvent(attempts, delay_ms, reason))
            await self._sleep(delay_ms / 1000)

    async def _send_once(
        self,
        method: str,
        path: str,
        params: dict[str, Any],
        json: Any,
        headers: dict[str, str] | None,
    ) -> httpx.Response:
        # asyncio.timeout bounds the whole attempt, not just individual socket reads.
        async with asyncio.timeout(self._attempt_timeout):
            token = await self._access_token()
            return await self._http.request(
                method,
                path,
                params=params,
                json=json,
                headers={"Authorization": f"Bearer {token}", **(headers or {})},
            )

    async def _access_token(self) -> str:
        """Client credentials grant; the token is cached until 30 s before it expires."""
        if self._token is not None and time.monotonic() < self._token_valid_until:
            return self._token
        response = await self._http.post(
            "/oauth/token",
            data={"grant_type": "client_credentials"},
            auth=self._credentials,
        )
        if not response.is_success:
            raise ApiError(
                f"token request failed with {response.status_code}", status=response.status_code
            )
        payload = response.json()
        self._token = str(payload["access_token"])
        lifetime = int(payload["expires_in"]) - TOKEN_REFRESH_MARGIN_SECONDS
        self._token_valid_until = time.monotonic() + lifetime
        return self._token

    @staticmethod
    def _problem_of(response: httpx.Response) -> Problem | None:
        if "problem+json" not in response.headers.get("content-type", ""):
            return None
        try:
            return cast(Problem, response.json())
        except ValueError:
            return None

    @staticmethod
    def _retry_after_seconds(response: httpx.Response) -> float | None:
        value = response.headers.get("retry-after")
        try:
            return max(0.0, float(value)) if value is not None else None
        except ValueError:
            return None  # an HTTP-date form is not used by this API
