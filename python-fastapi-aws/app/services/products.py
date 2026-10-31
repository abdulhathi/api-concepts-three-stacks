"""Concept 3 · HTTP methods: the create / replace / patch semantics of products."""

from collections.abc import Callable
from datetime import datetime

from app.ids import new_id
from app.models.products import Product, ProductCreate, ProductPatch, ProductReplace
from app.repositories.products import ProductRepository


class ProductService:
    def __init__(self, repo: ProductRepository, now: Callable[[], datetime]) -> None:
        self._repo = repo
        self._now = now

    async def create(self, data: ProductCreate) -> Product:
        now = self._now()
        product = Product(
            id=new_id("prd"),
            title=data.title,
            author=data.author,
            price_cents=data.price_cents,
            tags=data.tags,
            version=1,
            created_at=now,
            updated_at=now,
        )
        await self._repo.add(product)
        return product

    async def replace(self, current: Product, data: ProductReplace) -> Product:
        return await self._update(current, data.model_dump(by_alias=False))

    async def patch(self, current: Product, data: ProductPatch) -> Product:
        changes = data.model_dump(by_alias=False, exclude_unset=True)
        return await self._update(current, changes) if changes else current

    async def _update(self, current: Product, changes: dict[str, object]) -> Product:
        updated = current.model_copy(
            update={**changes, "version": current.version + 1, "updated_at": self._now()}
        )
        await self._repo.save(updated)
        return updated
