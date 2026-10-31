"""Concepts 3, 5, 16, 18, 19 · Products: resource lifecycle, caching and pagination."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.container import Container, container_of
from app.models.products import Product, ProductCreate, ProductPatch, ProductReplace
from app.routes.docs_models import AUTHENTICATED, NOT_FOUND, VALIDATED
from app.web.body import json_body
from app.web.docs import request_body
from app.web.etag import if_match_ok, none_match_hit, strong_etag, weak_etag
from app.web.pagination import decode_cursor, make_page, next_link, page_body
from app.web.problems import Problem
from app.web.responses import json_response

router = APIRouter(
    prefix="/v1/products", tags=["Products"], responses={**AUTHENTICATED, **VALIDATED}
)

Reader = Annotated[Principal, Depends(require("products:read"))]
Writer = Annotated[Principal, Depends(require("products:write"))]
Admin = Annotated[Principal, Depends(require("admin"))]
Services = Annotated[Container, Depends(container_of)]
IfMatch = Annotated[str | None, Header(description="Only act if the ETag still matches")]

PRODUCT_CACHE = "private, max-age=60"
LIST_CACHE = "private, max-age=30"


async def _find(container: Container, product_id: str) -> Product:
    product = await container.products.get(product_id)
    if product is None:
        raise Problem("not-found", f"Product '{product_id}' does not exist.")
    return product


def _check_precondition(product: Product, if_match: str | None) -> None:
    if not if_match_ok(if_match, strong_etag(product.id, product.version)):
        raise Problem(
            "precondition-failed",
            "The product changed; fetch it again and retry with the new ETag.",
        )


def _representation(
    product: Product, status: int = 200, headers: dict[str, str] | None = None
) -> Response:
    return json_response(
        product, status, {"ETag": strong_etag(product.id, product.version), **(headers or {})}
    )


@router.get("", response_model=None)
async def list_products(
    request: Request,
    _: Reader,
    container: Services,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    cursor: str | None = None,
    tag: str | None = None,
) -> Response:
    """Keyset-paginated list, ordered by creation time. Follow `Link: rel="next"` for more."""
    after = decode_cursor(cursor) if cursor is not None else None
    rows = await container.products.page(after=after, limit=limit + 1, tag=tag)
    page = make_page(rows, limit)
    response = json_response(
        page_body(page, Product.to_json),
        headers={
            "Cache-Control": LIST_CACHE,
            **next_link(request.url.path, page, tag=tag),
        },
    )
    etag = weak_etag(response.body)  # type: ignore[arg-type]
    if none_match_hit(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": LIST_CACHE})
    response.headers["ETag"] = etag
    return response


@router.get("/{product_id}", response_model=Product, responses=NOT_FOUND)
async def get_product(
    product_id: str, request: Request, _: Reader, container: Services
) -> Response:
    """Returns 304 with no body when `If-None-Match` matches the current ETag."""
    product = await _find(container, product_id)
    etag = strong_etag(product.id, product.version)
    if none_match_hit(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": PRODUCT_CACHE})
    return _representation(product, headers={"Cache-Control": PRODUCT_CACHE})


@router.post(
    "",
    status_code=201,
    response_model=Product,
    openapi_extra=request_body(ProductCreate),
)
async def create_product(
    _: Writer,
    container: Services,
    body: Annotated[ProductCreate, Depends(json_body(ProductCreate))],
) -> Response:
    product = await container.product_service.create(body)
    return _representation(product, 201, {"Location": f"/v1/products/{product.id}"})


@router.put(
    "/{product_id}",
    response_model=Product,
    responses={**NOT_FOUND, 412: {"description": "If-Match does not match"}},
    openapi_extra=request_body(ProductReplace),
)
async def replace_product(
    product_id: str,
    _: Writer,
    container: Services,
    body: Annotated[ProductReplace, Depends(json_body(ProductReplace))],
    if_match: IfMatch = None,
) -> Response:
    """Full replace: every field is required."""
    current = await _find(container, product_id)
    _check_precondition(current, if_match)
    return _representation(await container.product_service.replace(current, body))


@router.patch(
    "/{product_id}",
    response_model=Product,
    responses={**NOT_FOUND, 412: {"description": "If-Match does not match"}},
    openapi_extra=request_body(
        ProductPatch, content_types=("application/json", "application/merge-patch+json")
    ),
)
async def patch_product(
    product_id: str,
    _: Writer,
    container: Services,
    body: Annotated[ProductPatch, Depends(json_body(ProductPatch))],
    if_match: IfMatch = None,
) -> Response:
    """Partial update: only the fields present in the body change."""
    current = await _find(container, product_id)
    _check_precondition(current, if_match)
    return _representation(await container.product_service.patch(current, body))


@router.delete(
    "/{product_id}",
    status_code=204,
    responses={**NOT_FOUND, 412: {"description": "If-Match does not match"}},
)
async def delete_product(
    product_id: str, _: Admin, container: Services, if_match: IfMatch = None
) -> Response:
    current = await _find(container, product_id)
    _check_precondition(current, if_match)
    await container.products.delete(product_id)
    return Response(status_code=204)
