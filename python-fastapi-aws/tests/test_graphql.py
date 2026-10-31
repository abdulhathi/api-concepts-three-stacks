"""Concept 17: GraphQL."""

from typing import Any

from tests.helpers import Stack


async def gql(
    stack: Stack, query: str, headers: dict[str, str], variables: dict | None = None
) -> Any:
    return await stack.http.post(
        "/graphql",
        json={"query": query, "variables": variables},
        headers={**headers, "Accept": "application/json"},
    )


async def test_17_nested_query_reaches_from_order_to_product(stack: Stack):
    writer = await stack.auth("writer")
    created = await stack.http.post(
        "/v1/orders",
        json={"items": [{"productId": "prd_06", "quantity": 3}]},
        headers={**writer, "Idempotency-Key": "gql"},
    )
    query = """query($id: ID!) {
      order(id: $id) { id status totalCents items { quantity unitPriceCents product { id title tags } } }
    }"""
    response = await gql(stack, query, writer, {"id": created.json()["id"]})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    order = response.json()["data"]["order"]
    assert order["id"] == created.json()["id"] and order["status"] == "pending"
    assert order["totalCents"] == 3799 * 3
    assert order["items"] == [
        {
            "quantity": 3,
            "unitPriceCents": 3799,
            "product": {"id": "prd_06", "title": "The GraphQL Field Guide", "tags": ["graphql"]},
        }
    ]


async def test_17_products_connection_pages_with_end_cursor(stack: Stack):
    headers = await stack.auth("reader")
    query = "query($after: String) { products(first: 10, after: $after, tag: null) { nodes { id } pageInfo { endCursor hasNextPage } } }"
    ids: list[str] = []
    after = None
    for _ in range(3):
        data = (await gql(stack, query, headers, {"after": after})).json()["data"]["products"]
        ids += [n["id"] for n in data["nodes"]]
        after = data["pageInfo"]["endCursor"]
        if not data["pageInfo"]["hasNextPage"]:
            break
    assert ids == [f"prd_{n:02d}" for n in range(1, 26)]


async def test_17_single_product_and_missing_product(stack: Stack):
    headers = await stack.auth("reader")
    found = await gql(stack, '{ product(id: "prd_01") { title priceCents currency } }', headers)
    assert found.json()["data"]["product"] == {
        "title": "HTTP from the Ground Up", "priceCents": 3499, "currency": "USD",
    }  # fmt: skip
    missing = await gql(stack, '{ product(id: "prd_zz") { title } }', headers)
    assert missing.json() == {"data": {"product": None}}


async def test_17_order_without_orders_read_scope_is_forbidden(stack: Stack):
    headers = await stack.auth("reader", scope="products:read")
    response = await gql(stack, '{ order(id: "ord_x") { id } }', headers)

    body = response.json()
    assert response.status_code == 200
    assert body["data"] == {"order": None}
    assert body["errors"][0]["extensions"]["code"] == "FORBIDDEN"
    assert body["errors"][0]["path"] == ["order"]


async def test_17_another_clients_order_is_null(stack: Stack):
    created = await stack.http.post(
        "/v1/orders",
        json={"items": [{"productId": "prd_01", "quantity": 1}]},
        headers={**await stack.auth("writer"), "Idempotency-Key": "mine"},
    )
    response = await gql(
        stack, f'{{ order(id: "{created.json()["id"]}") {{ id }} }}', await stack.auth("partner")
    )
    assert response.json() == {"data": {"order": None}}


async def test_17_page_size_outside_1_to_50_is_a_bad_user_input_error(stack: Stack):
    headers = await stack.auth("reader")
    for first in (0, 51):
        body = (
            await gql(stack, f"{{ products(first: {first}) {{ nodes {{ id }} }} }}", headers)
        ).json()
        assert body["errors"][0]["extensions"]["code"] == "BAD_USER_INPUT"


async def test_17_graphql_endpoint_is_authenticated_like_rest(stack: Stack):
    anonymous = await stack.http.post(
        "/graphql", json={"query": '{ product(id: "prd_01") { id } }'}
    )
    assert anonymous.status_code == 401
    assert anonymous.headers["content-type"].startswith("application/problem+json")

    no_scope = await gql(
        stack, '{ product(id: "prd_01") { id } }', await stack.auth("reader", scope="orders:read")
    )
    assert no_scope.status_code == 403


async def test_17_invalid_queries_report_errors_without_data(stack: Stack):
    response = await gql(stack, '{ product(id: "prd_01") { nope } }', await stack.auth("reader"))
    body = response.json()
    assert response.status_code == 200 and "data" not in body and body["errors"]
    empty = await stack.http.post("/graphql", json={}, headers=await stack.auth("reader"))
    assert empty.status_code == 400
