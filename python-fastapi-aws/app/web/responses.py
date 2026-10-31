"""Small helpers for building JSON responses with the right headers."""

from collections.abc import Mapping
from typing import Any

from fastapi.responses import JSONResponse

from app.models.base import ApiModel
from app.web.problems import PROBLEM_MEDIA_TYPE  # noqa: F401  (re-exported for route docs)


def json_response(
    data: ApiModel | Mapping[str, Any] | list[Any],
    status: int = 200,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    content = data.to_json() if isinstance(data, ApiModel) else data
    return JSONResponse(content, status_code=status, headers=dict(headers or {}))
