"""Concept 26 · Webhooks: subscription and delivery-log shapes."""

from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field

from app.models.base import ApiModel, UtcTimestamp

EventType = Literal["order.created", "order.paid"]
DeliveryStatus = Literal["pending", "succeeded", "failed"]


def _http_url(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError("must be an http(s) URL")
    return value


def _dedupe(events: list[EventType]) -> list[EventType]:
    return list(dict.fromkeys(events))


class WebhookCreate(ApiModel):
    url: Annotated[str, AfterValidator(_http_url)]
    events: Annotated[list[EventType], Field(min_length=1), AfterValidator(_dedupe)]


class WebhookSummary(ApiModel):
    """What listing returns: never the secret."""

    id: str
    url: str
    events: list[EventType]
    created_at: UtcTimestamp


class Webhook(WebhookSummary):
    secret: str

    def summary(self) -> WebhookSummary:
        return WebhookSummary.model_validate(self.model_dump(exclude={"secret"}))


class Delivery(ApiModel):
    id: str
    subscription_id: str = Field(exclude=True)
    event_id: str
    event_type: EventType
    status: DeliveryStatus = "pending"
    attempts: int = 0
    last_status_code: int | None = None
    last_error: str | None = None
    created_at: UtcTimestamp
    updated_at: UtcTimestamp
