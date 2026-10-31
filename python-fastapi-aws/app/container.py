"""Dependency container: builds every collaborator once so tests can swap any of them."""

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime

import httpx
from fastapi import Request

from app.auth.clients import DEMO_CLIENTS, PLAN_LIMITS_PER_MINUTE, OAuthClient
from app.auth.ratelimit import TokenBucketLimiter
from app.auth.tokens import TokenService
from app.config import Settings
from app.repositories.idempotency import InMemoryIdempotencyStore
from app.repositories.orders import InMemoryOrderRepository, OrderRepository
from app.repositories.products import InMemoryProductRepository, ProductRepository
from app.repositories.webhooks import InMemoryWebhookRepository, WebhookRepository
from app.seed import seed_products
from app.services.orders import OrderService
from app.services.products import ProductService
from app.services.reports import ReportService
from app.services.throttle import ConcurrencyGate
from app.services.webhooks import WebhookDispatcher
from app.timefmt import utc_now


@dataclass(slots=True)
class Container:
    settings: Settings
    clients: dict[str, OAuthClient]
    tokens: TokenService
    limiter: TokenBucketLimiter
    products: ProductRepository
    orders: OrderRepository
    webhooks: WebhookRepository
    idempotency: InMemoryIdempotencyStore
    product_service: ProductService
    order_service: OrderService
    report_service: ReportService
    dispatcher: WebhookDispatcher
    flaky_calls: dict[str, int] = field(default_factory=dict)

    @classmethod
    def build(
        cls,
        settings: Settings,
        *,
        now: Callable[[], datetime] = utc_now,
        limiter_clock: Callable[[], float] = time.monotonic,
        products: ProductRepository | None = None,
        webhook_transport: httpx.AsyncBaseTransport | None = None,
        webhook_sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> "Container":
        product_repo = products or InMemoryProductRepository(seed_products())
        order_repo = InMemoryOrderRepository()
        webhook_repo = InMemoryWebhookRepository()
        return cls(
            settings=settings,
            clients=DEMO_CLIENTS,
            tokens=TokenService(
                secret=settings.jwt_secret,
                issuer=settings.jwt_issuer,
                audience=settings.jwt_audience,
                ttl_seconds=settings.token_ttl_seconds,
                clients=DEMO_CLIENTS,
                now=now,
            ),
            limiter=TokenBucketLimiter(PLAN_LIMITS_PER_MINUTE, limiter_clock),
            products=product_repo,
            orders=order_repo,
            webhooks=webhook_repo,
            idempotency=InMemoryIdempotencyStore(now),
            product_service=ProductService(product_repo, now),
            order_service=OrderService(order_repo, product_repo, now),
            report_service=ReportService(
                order_repo,
                ConcurrencyGate(max_running=2, max_waiting=2),
                timeout_ms=settings.request_timeout_ms,
                now=now,
            ),
            dispatcher=WebhookDispatcher(
                webhook_repo,
                httpx.AsyncClient(transport=webhook_transport),
                retry_base_ms=settings.webhook_retry_base_ms,
                max_attempts=settings.webhook_max_attempts,
                now=now,
                sleep=webhook_sleep,
            ),
        )


def container_of(request: Request) -> Container:
    container: Container = request.app.state.container
    return container
