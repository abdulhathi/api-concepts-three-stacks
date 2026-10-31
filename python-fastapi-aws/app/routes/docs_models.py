"""Concept 8 · API schemas: shared response declarations for the OpenAPI document."""

from typing import Any

from pydantic import BaseModel

from app.web.problems import PROBLEM_MEDIA_TYPE


class ProblemDetails(BaseModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str
    requestId: str
    errors: list[dict[str, str]] | None = None


def _problem(description: str) -> dict[str, Any]:
    return {
        "description": description,
        "model": ProblemDetails,
        "content": {PROBLEM_MEDIA_TYPE: {}},
    }


AUTHENTICATED: dict[int | str, dict[str, Any]] = {
    401: _problem("Missing, expired or invalid access token"),
    403: _problem("The token lacks the required scope"),
    429: _problem("Rate limit exceeded; see Retry-After"),
}
VALIDATED: dict[int | str, dict[str, Any]] = {
    400: _problem("Query, path or body failed validation, or the JSON is malformed"),
    415: _problem("Content-Type is not application/json"),
}
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: _problem("Unknown resource")}
