"""Concept 17 · GraphQL: one POST endpoint, authenticated like REST, executed by Strawberry."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import Field

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.container import Container, container_of
from app.gql.schema import Context, schema
from app.models.base import ApiModel
from app.routes.docs_models import AUTHENTICATED, VALIDATED
from app.web.body import json_body
from app.web.docs import request_body

router = APIRouter(tags=["GraphQL"], responses={**AUTHENTICATED, **VALIDATED})


class GraphQLRequest(ApiModel):
    query: str
    variables: dict[str, Any] | None = None
    operation_name: str | None = Field(default=None, alias="operationName")


@router.post("/graphql", openapi_extra=request_body(GraphQLRequest))
async def graphql(
    principal: Annotated[Principal, Depends(require("products:read"))],
    container: Annotated[Container, Depends(container_of)],
    body: Annotated[GraphQLRequest, Depends(json_body(GraphQLRequest))],
) -> JSONResponse:
    """GraphQL always answers 200; failures are reported in the `errors` array."""
    result = await schema.execute(
        body.query,
        variable_values=body.variables,
        operation_name=body.operation_name,
        context_value=Context(container, principal),
    )
    payload: dict[str, Any] = {}
    # An error with a path happened during execution, so the spec wants "data" (null if the root
    # failed).
    # Errors without a path stopped the request before execution: then "data" is left out.
    executed = result.data is not None or any(error.path for error in result.errors or [])
    if executed or not result.errors:
        payload["data"] = result.data
    if result.errors:
        payload["errors"] = [error.formatted for error in result.errors]
    return JSONResponse(payload)
