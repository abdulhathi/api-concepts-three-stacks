"""Concept 7 · JSON and serialization: the response shapes, as typed dictionaries."""

from typing import NotRequired, TypedDict


class FieldError(TypedDict):
    field: str
    message: str


class Problem(TypedDict):
    """RFC 9457 problem details."""

    type: str
    title: str
    status: int
    detail: str
    instance: str
    requestId: str
    errors: NotRequired[list[FieldError]]


class Product(TypedDict):
    id: str
    title: str
    author: str
    priceCents: int
    currency: str
    tags: list[str]
    version: int
    createdAt: str
    updatedAt: str


class OrderItem(TypedDict):
    productId: str
    title: str
    quantity: int
    unitPriceCents: int
    lineTotalCents: int


class Order(TypedDict):
    id: str
    clientId: str
    status: str
    items: list[OrderItem]
    totalCents: int
    currency: str
    createdAt: str
    updatedAt: str


class PageInfo(TypedDict):
    limit: int
    nextCursor: str | None
    hasMore: bool


class ProductPage(TypedDict):
    data: list[Product]
    page: PageInfo
