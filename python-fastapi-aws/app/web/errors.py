"""Concept 27 · Error handling: every failure path ends in problem+json."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.web.problems import Problem, problem_response, validation_problem


async def _on_problem(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, Problem)
    return problem_response(request, exc)


async def _on_validation_error(request: Request, exc: Exception) -> JSONResponse:
    # FastAPI's default is a 422 with its own shape; the contract wants a 400 problem instead.
    assert isinstance(exc, RequestValidationError)
    return problem_response(request, validation_problem(exc.errors(), strip_source=True))


async def _on_http_exception(request: Request, exc: Exception) -> JSONResponse:
    # Raised by the router itself for unknown routes (404) and wrong methods (405).
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code == 405:
        problem = Problem(
            "method-not-allowed",
            f"{request.method} is not allowed on this path.",
            headers={k: v for k, v in (exc.headers or {}).items() if k.lower() == "allow"},
        )
    else:
        problem = Problem("not-found", "The requested resource was not found.")
    return problem_response(request, problem)


def install_error_handlers(app: FastAPI) -> None:
    handlers: dict[Any, Any] = {
        Problem: _on_problem,
        RequestValidationError: _on_validation_error,
        StarletteHTTPException: _on_http_exception,
    }
    for exc_type, handler in handlers.items():
        app.add_exception_handler(exc_type, handler)
