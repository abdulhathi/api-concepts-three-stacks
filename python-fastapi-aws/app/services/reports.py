"""Concepts 21 and 24 · The slow report endpoint: throttled by a gate, cut off by a deadline."""

import asyncio
from collections.abc import Callable
from datetime import datetime
from typing import Any

from app.repositories.orders import OrderRepository
from app.services.throttle import ConcurrencyGate
from app.timefmt import format_timestamp
from app.web.problems import Problem


class ReportService:
    def __init__(
        self,
        orders: OrderRepository,
        gate: ConcurrencyGate,
        *,
        timeout_ms: int,
        now: Callable[[], datetime],
    ) -> None:
        self._orders = orders
        self._gate = gate
        self._timeout_s = timeout_ms / 1000
        self._now = now

    async def sales(self, delay_ms: int) -> dict[str, Any]:
        async def work() -> dict[str, Any]:
            await asyncio.sleep(delay_ms / 1000)  # stands in for a slow query
            orders = await self._orders.all()
            paid = [o for o in orders if o.status == "paid"]
            return {
                "orderCount": len(orders),
                "paidCount": len(paid),
                "revenueCents": sum(o.total_cents for o in paid),
                "generatedAt": format_timestamp(self._now()),
            }

        async def with_deadline() -> dict[str, Any]:
            # The deadline starts when the job gets a slot; time spent queued does not count.
            try:
                return await asyncio.wait_for(work(), timeout=self._timeout_s)
            except TimeoutError as exc:
                raise Problem(
                    "timeout", f"The report took longer than {int(self._timeout_s * 1000)} ms."
                ) from exc

        return await self._gate.run(with_deadline)
