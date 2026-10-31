"""Concept 16 · REST: the product collection behind a small repository interface."""

from collections.abc import Iterable
from typing import Protocol

from app.models.products import Product
from app.web.pagination import Cursor


class ProductRepository(Protocol):
    """Swap the in-memory implementation for DynamoDB or RDS without touching the routes."""

    async def get(self, product_id: str) -> Product | None: ...
    async def add(self, product: Product) -> None: ...
    async def save(self, product: Product) -> None: ...
    async def delete(self, product_id: str) -> bool: ...
    async def page(self, *, after: Cursor | None, limit: int, tag: str | None) -> list[Product]:
        """Up to `limit` products ordered by (createdAt, id), strictly after the cursor."""
        ...


class InMemoryProductRepository:
    def __init__(self, seed: Iterable[Product] = ()) -> None:
        self._items = {p.id: p for p in seed}

    async def get(self, product_id: str) -> Product | None:
        return self._items.get(product_id)

    async def add(self, product: Product) -> None:
        self._items[product.id] = product

    async def save(self, product: Product) -> None:
        self._items[product.id] = product

    async def delete(self, product_id: str) -> bool:
        return self._items.pop(product_id, None) is not None

    async def page(self, *, after: Cursor | None, limit: int, tag: str | None) -> list[Product]:
        ordered = sorted(self._items.values(), key=lambda p: (p.created_at, p.id))
        matching = (
            p
            for p in ordered
            if (tag is None or tag in p.tags)
            and (after is None or (p.created_at, p.id) > after.sort_key())
        )
        return [p for _, p in zip(range(limit), matching, strict=False)]
