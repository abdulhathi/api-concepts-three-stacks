"""Concepts 1, 4 and 5 · Requests and responses: echo what the server received."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.routes.docs_models import AUTHENTICATED, VALIDATED
from app.web.body import read_json

router = APIRouter(prefix="/v1", tags=["Echo"], responses={**AUTHENTICATED, **VALIDATED})


@router.get("/echo")
@router.post("/echo")
async def echo(request: Request, _: Annotated[Principal, Depends(require())]) -> dict[str, Any]:
    """Returns the method, path, first query values, headers (token masked) and parsed JSON body."""
    headers: dict[str, str] = {}
    for name, value in request.headers.items():
        headers[name] = f"{headers[name]}, {value}" if name in headers else value
    if "authorization" in headers:
        headers["authorization"] = "Bearer ***"
    return {
        "method": request.method,
        "path": request.url.path,
        "query": {name: request.query_params.getlist(name)[0] for name in request.query_params},
        "headers": headers,
        "body": await read_json(request, required=False) if request.method == "POST" else None,
    }
