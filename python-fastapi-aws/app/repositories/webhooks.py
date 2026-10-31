"""Concept 26 · Webhooks: subscriptions and the delivery log."""

from typing import Protocol

from app.models.webhooks import Delivery, EventType, Webhook


class WebhookRepository(Protocol):
    async def add(self, webhook: Webhook) -> None: ...
    async def get(self, webhook_id: str) -> Webhook | None: ...
    async def list_all(self) -> list[Webhook]: ...
    async def delete(self, webhook_id: str) -> bool: ...
    async def listening_to(self, event_type: EventType) -> list[Webhook]: ...
    async def add_delivery(self, delivery: Delivery) -> None: ...
    async def deliveries_for(self, webhook_id: str) -> list[Delivery]: ...


class InMemoryWebhookRepository:
    def __init__(self) -> None:
        self._webhooks: dict[str, Webhook] = {}
        self._deliveries: list[Delivery] = []

    async def add(self, webhook: Webhook) -> None:
        self._webhooks[webhook.id] = webhook

    async def get(self, webhook_id: str) -> Webhook | None:
        return self._webhooks.get(webhook_id)

    async def list_all(self) -> list[Webhook]:
        return list(self._webhooks.values())

    async def delete(self, webhook_id: str) -> bool:
        existed = self._webhooks.pop(webhook_id, None) is not None
        self._deliveries = [d for d in self._deliveries if d.subscription_id != webhook_id]
        return existed

    async def listening_to(self, event_type: EventType) -> list[Webhook]:
        return [w for w in self._webhooks.values() if event_type in w.events]

    async def add_delivery(self, delivery: Delivery) -> None:
        # Deliveries are mutated in place by the dispatcher as attempts complete.
        self._deliveries.append(delivery)

    async def deliveries_for(self, webhook_id: str) -> list[Delivery]:
        return [d for d in self._deliveries if d.subscription_id == webhook_id]
