"""Concept 27 · Error handling: RFC 9457 problem details with a fixed catalogue of slugs."""

from collections.abc import Mapping, Sequence
from typing import Any, TypedDict

from fastapi import Request
from fastapi.responses import JSONResponse

PROBLEM_MEDIA_TYPE = "application/problem+json"

# slug -> (status, title). The slug is the last segment of the `type` URI.
CATALOGUE: dict[str, tuple[int, str]] = {
    "validation-error": (400, "Your request is not valid"),
    "malformed-json": (400, "The request body is not valid JSON"),
    "invalid-cursor": (400, "The pagination cursor is not valid"),
    "idempotency-key-required": (400, "An Idempotency-Key header is required"),
    "unauthorized": (401, "Authentication is required"),
    "forbidden": (403, "You are not allowed to do this"),
    "not-found": (404, "Resource not found"),
    "method-not-allowed": (405, "Method not allowed"),
    "invalid-state": (409, "The resource is in a state that does not allow this"),
    "idempotency-key-in-progress": (409, "A request with this Idempotency-Key is in progress"),
    "precondition-failed": (412, "The resource changed since you last saw it"),
    "unsupported-media-type": (415, "Unsupported media type"),
    "unknown-product": (422, "The order references an unknown product"),
    "idempotency-key-reused": (422, "This Idempotency-Key was used with a different request"),
    "rate-limited": (429, "Too many requests"),
    "internal-error": (500, "Internal server error"),
    "throttled": (503, "The server is busy"),
    "service-unavailable": (503, "The service is temporarily unavailable"),
    "timeout": (504, "The request took too long"),
}


class FieldError(TypedDict):
    field: str
    message: str


class Problem(Exception):
    """Raise anywhere; the handler in `errors.py` turns it into a problem+json response."""

    def __init__(
        self,
        slug: str,
        detail: str,
        *,
        headers: Mapping[str, str] | None = None,
        errors: Sequence[FieldError] | None = None,
    ) -> None:
        super().__init__(detail)
        self.slug = slug
        self.status, self.title = CATALOGUE[slug]
        self.detail = detail
        self.headers = dict(headers or {})
        self.errors = list(errors) if errors is not None else None


def problem_response(request: Request, problem: Problem) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "")
    body: dict[str, Any] = {
        "type": f"/problems/{problem.slug}",
        "title": problem.title,
        "status": problem.status,
        "detail": problem.detail,
        "instance": request.url.path,
        "requestId": request_id,
    }
    if problem.errors is not None:
        body["errors"] = problem.errors
    return JSONResponse(
        body,
        status_code=problem.status,
        headers=problem.headers,
        media_type=PROBLEM_MEDIA_TYPE,
    )


def validation_problem(
    errors: Sequence[Mapping[str, Any]], *, strip_source: bool = False
) -> Problem:
    """Build a `validation-error` from Pydantic error dicts.

    FastAPI prefixes locations with the source (`query`, `path`, `header`); `strip_source` drops it.
    """
    field_errors: list[FieldError] = []
    for error in errors:
        loc = list(error.get("loc", ()))
        if strip_source and loc:
            loc = loc[1:]
        field = ".".join(str(part) for part in loc) or "body"
        field_errors.append({"field": field, "message": str(error["msg"])})
    detail = "; ".join(f"{e['field']}: {e['message']}" for e in field_errors)
    return Problem("validation-error", detail, errors=field_errors)
