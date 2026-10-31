"""Concept 22: idempotent order creation."""

import asyncio

from app.repositories.products import InMemoryProductRepository
from app.seed import seed_products
from tests.helpers import Stack, running

ORDER = {"items": [{"productId": "prd_01", "quantity": 2}, {"productId": "prd_02", "quantity": 1}]}


async def place(stack: Stack, key: str | None, body: dict | None = None, client: str = "writer"):
    headers = await stack.auth(client)
    if key is not None:
        headers["Idempotency-Key"] = key
    return await stack.http.post("/v1/orders", json=body or ORDER, headers=headers)


async def test_22_order_totals_are_computed_from_current_prices(stack: Stack):
    response = await place(stack, "k1")
    order = response.json()
    assert response.status_code == 201
    assert response.headers["location"] == f"/v1/orders/{order['id']}"
    assert "idempotent-replayed" not in response.headers
    assert order["status"] == "pending" and order["clientId"] == "writer"
    assert order["items"][0] == {
        "productId": "prd_01", "title": "HTTP from the Ground Up", "quantity": 2,
        "unitPriceCents": 3499, "lineTotalCents": 6998,
    }  # fmt: skip
    assert order["totalCents"] == 6998 + 4299


async def test_22_same_key_and_body_replays_the_first_response(stack: Stack):
    first = await place(stack, "replay-me")
    second = await place(stack, "replay-me")

    assert second.status_code == 201
    assert second.content == first.content
    assert second.headers["location"] == first.headers["location"]
    assert second.headers["idempotent-replayed"] == "true"

    listing = await stack.http.get("/v1/orders", headers=await stack.auth("writer"))
    assert len(listing.json()["data"]) == 1  # no second order was created


async def test_22_same_key_with_a_different_body_returns_422(stack: Stack):
    await place(stack, "reuse")
    other = await place(stack, "reuse", {"items": [{"productId": "prd_03", "quantity": 1}]})
    assert other.status_code == 422
    assert other.json()["type"] == "/problems/idempotency-key-reused"


async def test_22_keys_are_scoped_to_the_client(stack: Stack):
    first = await place(stack, "shared-key", client="writer")
    second = await place(stack, "shared-key", client="partner")
    assert second.status_code == 201 and second.json()["id"] != first.json()["id"]


async def test_22_missing_or_oversized_key_returns_400(stack: Stack):
    for key in (None, "", "k" * 256):
        response = await place(stack, key)
        assert response.status_code == 400
        assert response.json()["type"] == "/problems/idempotency-key-required"
    assert (await place(stack, "k" * 255)).status_code == 201


async def test_22_same_key_while_the_first_is_in_flight_returns_409():
    gate = asyncio.Event()

    class SlowProducts(InMemoryProductRepository):
        async def get(self, product_id: str):
            await gate.wait()
            return await super().get(product_id)

    async with running(products=SlowProducts(seed_products())) as stack:
        first = asyncio.create_task(place(stack, "slow"))
        await asyncio.sleep(0.05)  # let the first request claim the key and block on the gate

        duplicate = await place(stack, "slow")
        assert duplicate.status_code == 409
        assert duplicate.json()["type"] == "/problems/idempotency-key-in-progress"

        gate.set()
        assert (await first).status_code == 201
        assert (await place(stack, "slow")).headers["idempotent-replayed"] == "true"


async def test_22_failed_attempts_are_not_remembered(stack: Stack):
    bad = {"items": [{"productId": "prd_nope", "quantity": 1}]}
    failed = await place(stack, "retry-after-422", bad)
    assert failed.status_code == 422 and failed.json()["type"] == "/problems/unknown-product"

    fixed = await place(stack, "retry-after-422", ORDER)  # same key, corrected body
    assert fixed.status_code == 201


async def test_22_order_validation_and_payment(stack: Stack):
    assert (await place(stack, "v1", {"items": []})).status_code == 400
    assert (
        await place(stack, "v2", {"items": [{"productId": "prd_01", "quantity": 0}]})
    ).status_code == 400
    assert (
        await place(stack, "v3", {"items": [{"productId": "prd_01", "quantity": 101}]})
    ).status_code == 400

    order_id = (await place(stack, "pay-me")).json()["id"]
    writer = await stack.auth("writer")
    paid = await stack.http.post(f"/v1/orders/{order_id}/pay", headers=writer)
    assert paid.status_code == 200 and paid.json()["status"] == "paid"
    again = await stack.http.post(f"/v1/orders/{order_id}/pay", headers=writer)
    assert again.status_code == 200 and again.json() == paid.json()
