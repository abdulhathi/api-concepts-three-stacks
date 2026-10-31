"""Concepts 21 and 24 · Throttling and timeouts on the slow report endpoint."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.container import Container, container_of
from app.routes.docs_models import AUTHENTICATED, VALIDATED, ProblemDetails

router = APIRouter(
    prefix="/v1/reports",
    tags=["Reports"],
    responses={
        **AUTHENTICATED,
        **VALIDATED,
        503: {"description": "Report queue full; retry after 1 s", "model": ProblemDetails},
        504: {"description": "Report exceeded REQUEST_TIMEOUT_MS", "model": ProblemDetails},
    },
)


@router.get("/sales")
async def sales_report(
    _: Annotated[Principal, Depends(require("orders:read"))],
    container: Annotated[Container, Depends(container_of)],
    delay_ms: Annotated[int, Query(alias="delayMs", ge=0, le=10_000)] = 300,
) -> dict[str, Any]:
    """Slow on purpose: `delayMs` simulates work. 2 run at once, 2 wait, the rest get 503."""
    return await container.report_service.sales(delay_ms)
