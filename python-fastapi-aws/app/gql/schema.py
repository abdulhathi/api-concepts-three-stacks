"""Concept 17 · GraphQL: a Strawberry schema with a nested order -> item -> product query."""

from dataclasses import dataclass
from functools import partial

import strawberry
from graphql import GraphQLError
from strawberry.extensions import QueryDepthLimiter

from app.auth.tokens import Principal
from app.container import Container
from app.models import orders as order_models
from app.models import products as product_models
from app.web.pagination import Cursor, decode_cursor, encode_cursor
from app.web.problems import Problem

MAX_PAGE_SIZE = 50
MAX_QUERY_DEPTH = 8


@dataclass(slots=True)
class Context:
    container: Container
    principal: Principal


type Info = strawberry.Info[Context, None]


def _bad_input(message: str) -> GraphQLError:
    return GraphQLError(message, extensions={"code": "BAD_USER_INPUT"})


@strawberry.type
class Product:
    id: strawberry.ID
    title: str
    author: str
    price_cents: int
    currency: str
    tags: list[str]

    @classmethod
    def from_model(cls, p: product_models.Product) -> "Product":
        return cls(
            id=strawberry.ID(p.id),
            title=p.title,
            author=p.author,
            price_cents=p.price_cents,
            currency=p.currency,
            tags=list(p.tags),
        )


@strawberry.type
class PageInfo:
    end_cursor: str | None
    has_next_page: bool


@strawberry.type
class ProductConnection:
    nodes: list[Product]
    page_info: PageInfo


@strawberry.type
class OrderItem:
    quantity: int
    unit_price_cents: int
    _product_id: strawberry.Private[str]

    @strawberry.field
    async def product(self, info: Info) -> Product | None:
        found = await info.context.container.products.get(self._product_id)
        return Product.from_model(found) if found else None


@strawberry.type
class Order:
    id: strawberry.ID
    status: str
    total_cents: int
    items: list[OrderItem]

    @classmethod
    def from_model(cls, o: order_models.Order) -> "Order":
        return cls(
            id=strawberry.ID(o.id),
            status=o.status,
            total_cents=o.total_cents,
            items=[
                OrderItem(
                    quantity=i.quantity,
                    unit_price_cents=i.unit_price_cents,
                    _product_id=i.product_id,
                )
                for i in o.items
            ],
        )


@strawberry.type
class Query:
    @strawberry.field
    async def products(
        self, info: Info, first: int = 10, after: str | None = None, tag: str | None = None
    ) -> ProductConnection:
        if not 1 <= first <= MAX_PAGE_SIZE:
            raise _bad_input(f"first must be between 1 and {MAX_PAGE_SIZE}")
        try:
            cursor = decode_cursor(after) if after is not None else None
        except Problem as exc:
            raise _bad_input("after is not a valid cursor") from exc

        rows = await info.context.container.products.page(after=cursor, limit=first + 1, tag=tag)
        shown = rows[:first]
        end_cursor = encode_cursor(Cursor(shown[-1].created_at, shown[-1].id)) if shown else None
        return ProductConnection(
            nodes=[Product.from_model(p) for p in shown],
            page_info=PageInfo(end_cursor=end_cursor, has_next_page=len(rows) > first),
        )

    @strawberry.field
    async def product(self, info: Info, id: strawberry.ID) -> Product | None:
        found = await info.context.container.products.get(str(id))
        return Product.from_model(found) if found else None

    @strawberry.field
    async def order(self, info: Info, id: strawberry.ID) -> Order | None:
        principal = info.context.principal
        # Field-level authorization: the route only guarantees products:read.
        if "orders:read" not in principal.scopes:
            raise GraphQLError(
                "The 'orders:read' scope is required to read orders.",
                extensions={"code": "FORBIDDEN"},
            )
        found = await info.context.container.orders.get(str(id))
        if found is None or not (principal.is_admin or found.client_id == principal.client_id):
            return None
        return Order.from_model(found)


schema = strawberry.Schema(
    query=Query,
    # A factory, so each request gets a fresh extension instance.
    extensions=[partial(QueryDepthLimiter, max_depth=MAX_QUERY_DEPTH)],
)
