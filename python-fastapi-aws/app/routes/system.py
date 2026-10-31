"""Concept 2 · Endpoints: the unauthenticated entry points and `GET /v1/me`."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.routes.docs_models import AUTHENTICATED
from app.timefmt import format_timestamp

router = APIRouter()


@router.get("/", tags=["System"], include_in_schema=False)
async def index() -> dict[str, str]:
    return {"name": "Bookshop API", "docs": "/docs", "openapi": "/openapi.json"}


@router.get("/health", tags=["System"])
async def health() -> dict[str, str]:
    """Liveness probe. Not authenticated and never rate limited."""
    return {"status": "ok"}


@router.get("/v1/me", tags=["System"], responses=AUTHENTICATED)
async def me(principal: Annotated[Principal, Depends(require())]) -> dict[str, object]:
    """Who am I? Shows what the token says about the caller."""
    return {
        "clientId": principal.client_id,
        "scopes": list(principal.scopes),
        "plan": principal.plan,
        "tokenExpiresAt": format_timestamp(principal.expires_at),
    }
