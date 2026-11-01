"""Concept 6 · Request bodies: order payloads, plus the order resource shapes."""

from typing import Annotated, Literal

from pydantic import Field

from app.models.base import ApiInput, ApiModel, UtcTimestamp


class OrderItemInput(ApiInput):
    product_id: str
    quantity: Annotated[int, Field(strict=True, ge=1, le=100)]


class OrderCreate(ApiInput):
    items: Annotated[list[OrderItemInput], Field(min_length=1, max_length=50)]


class OrderItem(ApiModel):
    product_id: str
    title: str
    quantity: int
    unit_price_cents: int
    line_total_cents: int


class Order(ApiModel):
    id: str
    client_id: str
    status: Literal["pending", "paid"]
    items: list[OrderItem]
    total_cents: int
    currency: str = "USD"
    created_at: UtcTimestamp
    updated_at: UtcTimestamp
