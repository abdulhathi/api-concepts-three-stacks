"""Concept 11 · Authorization and concept 22 · Idempotency: order creation and payment."""

from collections.abc import Callable
from datetime import datetime

from app.ids import new_id
from app.models.orders import Order, OrderCreate, OrderItem
from app.repositories.orders import OrderRepository
from app.repositories.products import ProductRepository
from app.web.problems import Problem


class OrderService:
    def __init__(
        self, orders: OrderRepository, products: ProductRepository, now: Callable[[], datetime]
    ) -> None:
        self._orders = orders
        self._products = products
        self._now = now

    async def create(self, client_id: str, data: OrderCreate) -> Order:
        items: list[OrderItem] = []
        for line in data.items:
            product = await self._products.get(line.product_id)
            if product is None:
                raise Problem("unknown-product", f"Product '{line.product_id}' does not exist.")
            items.append(
                OrderItem(
                    product_id=product.id,
                    title=product.title,
                    quantity=line.quantity,
                    unit_price_cents=product.price_cents,
                    line_total_cents=product.price_cents * line.quantity,
                )
            )
        now = self._now()
        order = Order(
            id=new_id("ord"),
            client_id=client_id,
            status="pending",
            items=items,
            total_cents=sum(i.line_total_cents for i in items),
            created_at=now,
            updated_at=now,
        )
        await self._orders.add(order)
        return order

    async def pay(self, order: Order) -> tuple[Order, bool]:
        """Returns the order and whether it changed (paying twice is a no-op, not an error)."""
        if order.status == "paid":
            return order, False
        paid = order.model_copy(update={"status": "paid", "updated_at": self._now()})
        await self._orders.save(paid)
        return paid, True
