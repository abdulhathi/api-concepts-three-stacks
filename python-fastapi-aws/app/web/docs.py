"""Concept 8 · API schemas: request-body schemas for routes whose body FastAPI does not parse.

Bodies are read by `json_body` (see body.py), so FastAPI cannot infer them. This module declares
them for the OpenAPI document instead, hoisting nested models into `components.schemas`.
"""

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel

_REGISTERED: dict[str, type[BaseModel]] = {}
_REF_TEMPLATE = "#/components/schemas/{model}"


def request_body(
    model: type[BaseModel], *, content_types: tuple[str, ...] = ("application/json",)
) -> dict[str, Any]:
    """Value for a route's `openapi_extra`."""
    _REGISTERED[model.__name__] = model
    ref = {"$ref": _REF_TEMPLATE.format(model=model.__name__)}
    return {
        "requestBody": {"required": True, "content": {ct: {"schema": ref} for ct in content_types}}
    }


def install_openapi(app: FastAPI) -> None:
    def build() -> dict[str, Any]:
        if app.openapi_schema is None:
            schema = get_openapi(
                title=app.title,
                version=app.version,
                description=app.description,
                routes=app.routes,
            )
            components = schema.setdefault("components", {}).setdefault("schemas", {})
            for name, model in _REGISTERED.items():
                generated = model.model_json_schema(by_alias=True, ref_template=_REF_TEMPLATE)
                components.update(generated.pop("$defs", {}))
                components[name] = generated
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = build  # type: ignore[method-assign]
