"""Concepts 1-9: the HTTP fundamentals."""

import json
import logging
import re
from typing import Any

import pytest

from tests.helpers import Stack

TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


async def test_01_echo_returns_request_details_and_masks_the_token(stack: Stack):
    headers = {**await stack.auth("reader"), "X-Custom": "hello"}
    response = await stack.http.post("/v1/echo?a=1&a=2&b=x", json={"hi": "there"}, headers=headers)

    body = response.json()
    assert response.status_code == 200
    assert body["method"] == "POST"
    assert body["path"] == "/v1/echo"
    assert body["query"] == {"a": "1", "b": "x"}
    assert body["headers"]["authorization"] == "Bearer ***"
    assert body["headers"]["x-custom"] == "hello"
    assert body["body"] == {"hi": "there"}


async def test_01_echo_get_has_null_body(stack: Stack):
    response = await stack.http.get("/v1/echo", headers=await stack.auth("reader"))
    assert response.json()["body"] is None


async def test_01_access_log_is_one_json_line_without_secrets(
    stack: Stack, caplog: pytest.LogCaptureFixture
):
    headers = await stack.auth("reader")
    with caplog.at_level(logging.INFO, logger="api.access"):
        response = await stack.http.get("/v1/me", headers=headers)

    lines = [json.loads(r.getMessage()) for r in caplog.records if r.name == "api.access"]
    entry = lines[-1]
    assert set(entry) == {
        "ts",
        "level",
        "requestId",
        "method",
        "path",
        "status",
        "durationMs",
        "clientId",
    }
    assert entry["requestId"] == response.headers["x-request-id"]
    assert entry["clientId"] == "reader" and entry["status"] == 200
    assert headers["Authorization"].split()[1] not in caplog.text


async def test_02_resources_are_routed_under_v1(stack: Stack):
    headers = await stack.auth("reader")
    root = await stack.http.get("/")
    assert root.json() == {"name": "Bookshop API", "docs": "/docs", "openapi": "/openapi.json"}
    assert (await stack.http.get("/health")).json() == {"status": "ok"}
    assert (await stack.http.get("/v1/products", headers=headers)).status_code == 200
    assert (await stack.http.get("/v1/orders", headers=headers)).status_code == 200


async def test_03_http_methods_create_replace_patch_delete_a_product(stack: Stack):
    writer = await stack.auth("writer")
    created = await stack.http.post(
        "/v1/products",
        json={"title": "Test Book", "author": "A. Uthor", "priceCents": 1000, "tags": ["x"]},
        headers=writer,
    )
    assert created.status_code == 201
    product_id = created.json()["id"]
    assert re.fullmatch(r"prd_[0-9a-f]{12}", product_id)
    assert created.json()["version"] == 1

    replaced = await stack.http.put(
        f"/v1/products/{product_id}",
        json={"title": "Renamed", "author": "A. Uthor", "priceCents": 1200, "tags": []},
        headers=writer,
    )
    assert replaced.status_code == 200
    assert replaced.json()["version"] == 2 and replaced.json()["tags"] == []

    patched = await stack.http.patch(
        f"/v1/products/{product_id}", json={"priceCents": 1500}, headers=writer
    )
    assert patched.json()["priceCents"] == 1500
    assert patched.json()["title"] == "Renamed"
    assert patched.json()["version"] == 3

    admin = await stack.auth("admin")
    assert (await stack.http.delete(f"/v1/products/{product_id}", headers=admin)).status_code == 204
    assert (await stack.http.get(f"/v1/products/{product_id}", headers=admin)).status_code == 404


async def test_03_put_requires_every_field(stack: Stack):
    response = await stack.http.put(
        "/v1/products/prd_01", json={"title": "Only a title"}, headers=await stack.auth("writer")
    )
    assert response.status_code == 400
    assert {e["field"] for e in response.json()["errors"]} == {"author", "priceCents", "tags"}


async def test_04_request_id_is_echoed_when_valid_and_generated_otherwise(stack: Stack):
    echoed = await stack.http.get("/health", headers={"X-Request-Id": "abc-123_X.y"})
    assert echoed.headers["x-request-id"] == "abc-123_X.y"

    for bad in ("has spaces", "x" * 129, "semi;colon"):
        replaced = await stack.http.get("/health", headers={"X-Request-Id": bad})
        assert re.fullmatch(r"[0-9a-f-]{36}", replaced.headers["x-request-id"])

    missing = await stack.http.get("/nope")
    assert missing.status_code == 404 and "x-request-id" in missing.headers


async def test_04_wrong_content_type_returns_415(stack: Stack):
    response = await stack.http.post(
        "/v1/products",
        content='{"title": "x"}',
        headers={**await stack.auth("writer"), "Content-Type": "text/plain"},
    )
    assert response.status_code == 415
    assert response.json()["type"] == "/problems/unsupported-media-type"


async def test_04_merge_patch_content_type_is_accepted_on_patch(stack: Stack):
    response = await stack.http.patch(
        "/v1/products/prd_01",
        content='{"priceCents": 100}',
        headers={**await stack.auth("writer"), "Content-Type": "application/merge-patch+json"},
    )
    assert response.status_code == 200


async def test_04_security_headers_are_on_every_response(stack: Stack):
    for path in ("/health", "/nope", "/v1/me"):
        response = await stack.http.get(path)
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["referrer-policy"] == "no-referrer"


async def test_04_location_header_points_at_the_new_resource(stack: Stack):
    response = await stack.http.post(
        "/v1/products",
        json={"title": "T", "author": "A", "priceCents": 1},
        headers=await stack.auth("writer"),
    )
    assert response.headers["location"] == f"/v1/products/{response.json()['id']}"


async def test_05_path_and_query_parameters_select_and_filter(stack: Stack):
    headers = await stack.auth("reader")
    one = await stack.http.get("/v1/products/prd_17", headers=headers)
    assert one.json()["title"] == "Serverless APIs on AWS"

    tagged = await stack.http.get("/v1/products?tag=reliability&limit=50", headers=headers)
    assert [p["id"] for p in tagged.json()["data"]] == ["prd_08", "prd_09", "prd_13", "prd_23"]


@pytest.mark.parametrize("query", ["limit=0", "limit=51", "limit=abc"])
async def test_05_invalid_query_parameter_returns_400_validation_error(stack: Stack, query: str):
    response = await stack.http.get(f"/v1/products?{query}", headers=await stack.auth("reader"))
    body = response.json()
    assert response.status_code == 400
    assert body["type"] == "/problems/validation-error"
    assert body["errors"][0]["field"] == "limit"


async def test_06_invalid_body_lists_every_failing_field(stack: Stack):
    response = await stack.http.post(
        "/v1/products",
        json={
            "title": "  ",
            "author": "x" * 101,
            "priceCents": 12.5,
            "tags": ["Bad Tag", "ok", "ok"],
        },
        headers=await stack.auth("writer"),
    )
    assert response.status_code == 400
    fields = {e["field"] for e in response.json()["errors"]}
    assert {"title", "author", "priceCents", "tags.0"} <= fields


async def test_06_malformed_json_returns_400(stack: Stack):
    response = await stack.http.post(
        "/v1/products",
        content="{not json",
        headers={**await stack.auth("writer"), "Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["type"] == "/problems/malformed-json"


async def test_06_unknown_properties_are_ignored_and_strings_are_trimmed(stack: Stack):
    response = await stack.http.post(
        "/v1/products",
        json={"title": "  Padded  ", "author": "A", "priceCents": 5, "surprise": True},
        headers=await stack.auth("writer"),
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Padded"
    assert "surprise" not in response.json()


async def test_07_json_is_camel_case_with_integer_cents_and_utc_milliseconds(stack: Stack):
    product: dict[str, Any] = (
        await stack.http.get("/v1/products/prd_01", headers=await stack.auth("reader"))
    ).json()
    assert set(product) == {
        "id", "title", "author", "priceCents", "currency", "tags", "version", "createdAt", "updatedAt",
    }  # fmt: skip
    assert product["priceCents"] == 3499 and isinstance(product["priceCents"], int)
    assert product["currency"] == "USD"
    assert product["createdAt"] == "2026-01-01T00:00:00.000Z"
    assert TIMESTAMP.match(product["updatedAt"])


async def test_07_nullable_fields_are_present_as_null(stack: Stack):
    page = (
        await stack.http.get("/v1/products?limit=50", headers=await stack.auth("reader"))
    ).json()
    assert page["page"] == {"limit": 50, "nextCursor": None, "hasMore": False}


async def test_08_openapi_document_describes_routes_and_bodies(stack: Stack):
    document = (await stack.http.get("/openapi.json")).json()
    assert document["openapi"].startswith("3.")
    assert {"/v1/products", "/v1/orders", "/graphql", "/oauth/token"} <= set(document["paths"])
    schemas = document["components"]["schemas"]
    assert "ProductCreate" in schemas and "OrderItemInput" in schemas
    assert schemas["ProductCreate"]["properties"]["priceCents"]["maximum"] == 10_000_000
    assert "bearerAuth" in document["components"]["securitySchemes"]

    docs = await stack.http.get("/docs")
    assert docs.status_code == 200 and "swagger" in docs.text.lower()


async def test_09_status_codes_follow_the_contract(stack: Stack):
    reader = await stack.auth("reader")
    writer = await stack.auth("writer")
    admin = await stack.auth("admin")
    product = {"title": "T", "author": "A", "priceCents": 1}

    statuses = {
        "200 get": (await stack.http.get("/v1/products/prd_01", headers=reader)).status_code,
        "201 create": (await stack.http.post("/v1/products", json=product, headers=writer)).status_code,
        "400 validation": (await stack.http.post("/v1/products", json={}, headers=writer)).status_code,
        "401 no token": (await stack.http.get("/v1/products")).status_code,
        "403 scope": (await stack.http.post("/v1/products", json=product, headers=reader)).status_code,
        "404 unknown": (await stack.http.get("/v1/products/prd_zz", headers=reader)).status_code,
        "415 media": (
            await stack.http.post("/v1/products", content="x", headers={**writer, "Content-Type": "text/plain"})
        ).status_code,
        "204 delete": (await stack.http.delete("/v1/products/prd_25", headers=admin)).status_code,
    }  # fmt: skip
    assert statuses == {
        "200 get": 200, "201 create": 201, "400 validation": 400, "401 no token": 401,
        "403 scope": 403, "404 unknown": 404, "415 media": 415, "204 delete": 204,
    }  # fmt: skip
