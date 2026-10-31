"""Concept 11 · Authorization: orders keep their owner; callers check visibility."""

from typing import Protocol

from app.models.orders import Order
from app.web.pagination import Cursor


class OrderRepository(Protocol):
    async def get(self, order_id: str) -> Order | None: ...
    async def add(self, order: Order) -> None: ...
    async def save(self, order: Order) -> None: ...
    async def all(self) -> list[Order]: ...
    async def page(self, *, after: Cursor | None, limit: int, client_id: str | None) -> list[Order]:
        """Orders ordered by (createdAt, id); `client_id=None` means every client's orders."""
        ...


class InMemoryOrderRepository:
    def __init__(self) -> None:
        self._items: dict[str, Order] = {}

    async def get(self, order_id: str) -> Order | None:
        return self._items.get(order_id)

    async def add(self, order: Order) -> None:
        self._items[order.id] = order

    async def save(self, order: Order) -> None:
        self._items[order.id] = order

    async def all(self) -> list[Order]:
        return list(self._items.values())

    async def page(self, *, after: Cursor | None, limit: int, client_id: str | None) -> list[Order]:
        ordered = sorted(self._items.values(), key=lambda o: (o.created_at, o.id))
        matching = (
            o
            for o in ordered
            if (client_id is None or o.client_id == client_id)
            and (after is None or (o.created_at, o.id) > after.sort_key())
        )
        return [o for _, o in zip(range(limit), matching, strict=False)]
