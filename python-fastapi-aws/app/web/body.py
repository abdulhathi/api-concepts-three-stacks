"""Concepts 4 and 6 · Content-Type check (415), JSON parsing (400) and body validation.

FastAPI parses bodies before it runs dependencies, which would answer a malformed body with
400 even for an unauthenticated caller and ignore the 415 rule. Reading the body inside a
dependency keeps the order: authenticate, then media type, then JSON, then schema.
"""

import json
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Request
from pydantic import BaseModel, ValidationError

from app.web.problems import Problem, validation_problem

JSON_TYPE = "application/json"
MERGE_PATCH_TYPE = "application/merge-patch+json"


async def read_json(request: Request, *, required: bool) -> Any:
    raw = await request.body()
    if not raw:
        if required:
            raise validation_problem([{"loc": (), "msg": "Request body is required"}])
        return None

    media_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    accepted = {JSON_TYPE, MERGE_PATCH_TYPE} if request.method == "PATCH" else {JSON_TYPE}
    if media_type not in accepted:
        raise Problem(
            "unsupported-media-type",
            f"Content-Type must be {JSON_TYPE}, got '{media_type or 'none'}'.",
        )
    try:
        return json.loads(raw)
    except (ValueError, RecursionError) as exc:
        raise Problem("malformed-json", "The request body is not valid JSON.") from exc


def json_body[M: BaseModel](model: type[M]) -> Callable[[Request], Awaitable[M]]:
    """Dependency factory: `body: Annotated[ProductCreate, Depends(json_body(ProductCreate))]`."""

    async def dependency(request: Request) -> M:
        data = await read_json(request, required=True)
        try:
            return model.model_validate(data)
        except ValidationError as exc:
            raise validation_problem(exc.errors()) from exc

    return dependency
