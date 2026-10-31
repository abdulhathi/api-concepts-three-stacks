"""Concepts 23, 25 and 27 · Demo endpoints that fail on purpose, for clients and error handling."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.container import Container, container_of
from app.routes.docs_models import AUTHENTICATED, VALIDATED
from app.web.problems import Problem

router = APIRouter(prefix="/v1/demo", tags=["Demo"], responses={**AUTHENTICATED, **VALIDATED})


@router.get("/flaky")
async def flaky(
    _: Annotated[Principal, Depends(require())],
    container: Annotated[Container, Depends(container_of)],
    key: Annotated[str, Query(min_length=1, max_length=64)],
    fail_times: Annotated[int, Query(alias="failTimes", ge=0, le=10)] = 2,
) -> dict[str, object]:
    """Answers 503 for the first `failTimes` calls per `key`, then 200."""
    attempts = container.flaky_calls.get(key, 0) + 1
    container.flaky_calls[key] = attempts
    if attempts <= fail_times:
        raise Problem("service-unavailable", f"Simulated outage (call {attempts} of {fail_times}).")
    return {"key": key, "attempts": attempts}


@router.get("/crash")
async def crash(_: Annotated[Principal, Depends(require())]) -> None:
    """Always raises, to show that unexpected errors become a generic 500 problem."""
    raise RuntimeError("deliberate crash: this message must never reach the client")
