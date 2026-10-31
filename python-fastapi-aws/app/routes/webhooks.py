"""Concept 26 · Webhooks: manage subscriptions and read the delivery log (admin only)."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response

from app.auth.dependencies import require
from app.auth.tokens import Principal
from app.container import Container, container_of
from app.ids import new_id
from app.models.webhooks import Webhook, WebhookCreate, WebhookSummary
from app.routes.docs_models import AUTHENTICATED, NOT_FOUND, VALIDATED
from app.services.webhooks import new_secret
from app.timefmt import utc_now
from app.web.body import json_body
from app.web.docs import request_body
from app.web.problems import Problem
from app.web.responses import json_response

router = APIRouter(
    prefix="/v1/webhooks", tags=["Webhooks"], responses={**AUTHENTICATED, **VALIDATED}
)

Admin = Annotated[Principal, Depends(require("admin"))]
Services = Annotated[Container, Depends(container_of)]


async def _find(container: Container, webhook_id: str) -> Webhook:
    webhook = await container.webhooks.get(webhook_id)
    if webhook is None:
        raise Problem("not-found", f"Webhook '{webhook_id}' does not exist.")
    return webhook


@router.post("", status_code=201, response_model=Webhook, openapi_extra=request_body(WebhookCreate))
async def subscribe(
    _: Admin,
    container: Services,
    body: Annotated[WebhookCreate, Depends(json_body(WebhookCreate))],
) -> Response:
    """The signing secret is shown once, in this response only."""
    webhook = Webhook(
        id=new_id("whk"),
        url=body.url,
        events=body.events,
        secret=new_secret(),
        created_at=utc_now(),
    )
    await container.webhooks.add(webhook)
    return json_response(webhook, 201, {"Location": f"/v1/webhooks/{webhook.id}"})


@router.get("")
async def list_webhooks(_: Admin, container: Services) -> dict[str, list[WebhookSummary]]:
    return {"data": [w.summary() for w in await container.webhooks.list_all()]}


@router.delete("/{webhook_id}", status_code=204, responses=NOT_FOUND)
async def unsubscribe(webhook_id: str, _: Admin, container: Services) -> Response:
    await _find(container, webhook_id)
    await container.webhooks.delete(webhook_id)
    return Response(status_code=204)


@router.get("/{webhook_id}/deliveries", responses=NOT_FOUND)
async def delivery_log(webhook_id: str, _: Admin, container: Services) -> dict[str, Any]:
    await _find(container, webhook_id)
    deliveries = await container.webhooks.deliveries_for(webhook_id)
    return {"data": [d.to_json() for d in deliveries]}
