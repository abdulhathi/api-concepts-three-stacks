"""Concepts 11 and 22 · Orders: ownership checks and idempotent creation."""

import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.container import Container, container_of
from app.models.orders import Order, OrderCreate
from app.repositories.idempotency import InProgress, Replay, Reused, StoredResponse
from app.routes.docs_models import AUTHENTICATED, NOT_FOUND, VALIDATED
from app.web.body import json_body
from app.web.docs import request_body
from app.web.pagination import decode_cursor, make_page, next_link, page_body
from app.web.problems import Problem
from app.web.responses import json_response

router = APIRouter(prefix="/v1/orders", tags=["Orders"], responses={**AUTHENTICATED, **VALIDATED})

Reader = Annotated[Principal, Depends(require("orders:read"))]
Writer = Annotated[Principal, Depends(require("orders:write"))]
Services = Annotated[Container, Depends(container_of)]


async def idempotency_key(
    key: Annotated[
        str | None,
        Header(alias="Idempotency-Key", description="Unique per logical order (1-255 chars)"),
    ] = None,
) -> str:
    if key is None or not 1 <= len(key) <= 255:
        raise Problem(
            "idempotency-key-required",
            "Send an Idempotency-Key header of 1 to 255 characters with POST /v1/orders.",
        )
    return key


async def _visible_order(container: Container, principal: Principal, order_id: str) -> Order:
    """Another client's order is reported as missing, so ids cannot be probed (concept 11)."""
    order = await container.orders.get(order_id)
    if order is None or not (principal.is_admin or order.client_id == principal.client_id):
        raise Problem("not-found", f"Order '{order_id}' does not exist.")
    return order


@router.post(
    "",
    status_code=201,
    response_model=Order,
    responses={
        409: {"description": "Same Idempotency-Key still being processed"},
        422: {"description": "Unknown product, or Idempotency-Key reused with a different body"},
    },
    openapi_extra=request_body(OrderCreate),
)
async def create_order(
    request: Request,
    principal: Writer,
    container: Services,
    key: Annotated[str, Depends(idempotency_key)],
    body: Annotated[OrderCreate, Depends(json_body(OrderCreate))],
) -> Response:
    """Safe to retry: the same key and body replays the first 201, creating no second order."""
    body_hash = hashlib.sha256(await request.body()).hexdigest()
    outcome = container.idempotency.begin(principal.client_id, key, body_hash)

    match outcome:
        case Replay(stored):
            return Response(
                stored.body,
                status_code=stored.status,
                media_type="application/json",
                headers={"Location": stored.location, "Idempotent-Replayed": "true"},
            )
        case InProgress():
            raise Problem(
                "idempotency-key-in-progress",
                "A request with this Idempotency-Key is still being processed.",
            )
        case Reused():
            raise Problem(
                "idempotency-key-reused",
                "This Idempotency-Key was already used with a different request body.",
            )

    try:
        order = await container.order_service.create(principal.client_id, body)
    except BaseException:
        # Failed attempts are not remembered, so the client may retry with the same key.
        container.idempotency.release(principal.client_id, key)
        raise

    response = json_response(order, 201, {"Location": f"/v1/orders/{order.id}"})
    container.idempotency.complete(
        principal.client_id,
        key,
        StoredResponse(201, bytes(response.body), f"/v1/orders/{order.id}"),
    )
    await container.dispatcher.publish("order.created", {"order": order.to_json()})
    return response


@router.get("", response_model=None)
async def list_orders(
    request: Request,
    principal: Reader,
    container: Services,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    cursor: str | None = None,
) -> Response:
    """The caller's orders; an admin sees everyone's."""
    after = decode_cursor(cursor) if cursor is not None else None
    rows = await container.orders.page(
        after=after, limit=limit + 1, client_id=None if principal.is_admin else principal.client_id
    )
    page = make_page(rows, limit)
    return json_response(page_body(page, Order.to_json), headers=next_link(request.url.path, page))


@router.get("/{order_id}", response_model=Order, responses=NOT_FOUND)
async def get_order(order_id: str, principal: Reader, container: Services) -> Response:
    return json_response(await _visible_order(container, principal, order_id))


@router.post("/{order_id}/pay", response_model=Order, responses=NOT_FOUND)
async def pay_order(order_id: str, principal: Writer, container: Services) -> Response:
    """pending -> paid. Paying an already paid order returns it unchanged and emits no event."""
    order = await _visible_order(container, principal, order_id)
    paid, changed = await container.order_service.pay(order)
    if changed:
        await container.dispatcher.publish("order.paid", {"order": paid.to_json()})
    return json_response(paid)
