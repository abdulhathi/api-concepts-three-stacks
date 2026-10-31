"""Concepts 10-15: authentication, authorization, JWT, OAuth 2.0, HTTPS and CORS."""

import time
import uuid

import jwt
import pytest

from app.config import DEFAULT_JWT_SECRET
from tests.helpers import Stack

BEARER = 'Bearer realm="api-concepts"'


def forged_token(**overrides: object) -> str:
    now = int(time.time())
    claims = {
        "iss": "api-concepts", "aud": "api-concepts-clients", "sub": "reader",
        "scope": "products:read", "iat": now, "exp": now + 600, "jti": str(uuid.uuid4()),
    }  # fmt: skip
    claims.update(overrides)
    return jwt.encode(
        {k: v for k, v in claims.items() if v is not None}, DEFAULT_JWT_SECRET, "HS256"
    )


async def test_10_missing_token_returns_401_with_a_bearer_challenge(stack: Stack):
    response = await stack.http.get("/v1/products")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == BEARER
    assert response.json()["type"] == "/problems/unauthorized"


@pytest.mark.parametrize(
    "token",
    [
        "garbage",
        forged_token(exp=int(time.time()) - 1),
        forged_token(iss="someone-else"),
        forged_token(aud="other-audience"),
        forged_token(sub=None),
        jwt.encode({"sub": "reader"}, "another-secret-of-32-bytes-or-more!!", "HS256"),
        jwt.encode({"sub": "reader", "exp": int(time.time()) + 60}, None, "none"),
    ],
    ids=[
        "garbage",
        "expired",
        "wrong-issuer",
        "wrong-audience",
        "no-subject",
        "bad-signature",
        "alg-none",
    ],
)
async def test_10_rejected_tokens_return_401_invalid_token(stack: Stack, token: str):
    response = await stack.http.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == f'{BEARER}, error="invalid_token"'


async def test_10_a_valid_token_identifies_the_caller(stack: Stack):
    response = await stack.http.get("/v1/me", headers=await stack.auth("writer"))
    body = response.json()
    assert body["clientId"] == "writer" and body["plan"] == "standard"
    assert body["scopes"] == ["products:read", "products:write", "orders:read", "orders:write"]
    assert body["tokenExpiresAt"].endswith("Z")


async def test_11_missing_scope_returns_403_naming_the_scope(stack: Stack):
    response = await stack.http.post(
        "/v1/products",
        json={"title": "T", "author": "A", "priceCents": 1},
        headers=await stack.auth("reader"),
    )
    assert response.status_code == 403
    assert response.headers["www-authenticate"] == (
        f'{BEARER}, error="insufficient_scope", scope="products:write"'
    )


async def test_11_another_clients_order_is_404_but_admin_can_read_it(stack: Stack):
    writer = await stack.auth("writer")
    created = await stack.http.post(
        "/v1/orders",
        json={"items": [{"productId": "prd_01", "quantity": 1}]},
        headers={**writer, "Idempotency-Key": "k-own"},
    )
    order_id = created.json()["id"]

    other = await stack.auth("partner")
    assert (await stack.http.get(f"/v1/orders/{order_id}", headers=other)).status_code == 404
    assert (await stack.http.post(f"/v1/orders/{order_id}/pay", headers=other)).status_code == 404
    assert (await stack.http.get(f"/v1/orders/{order_id}", headers=writer)).status_code == 200
    assert (
        await stack.http.get(f"/v1/orders/{order_id}", headers=await stack.auth("admin"))
    ).status_code == 200

    assert (await stack.http.get("/v1/orders", headers=other)).json()["data"] == []
    assert (
        len((await stack.http.get("/v1/orders", headers=await stack.auth("admin"))).json()["data"])
        == 1
    )


async def test_12_access_token_is_an_hs256_jwt_with_the_required_claims(stack: Stack):
    token = await stack.token("admin")
    header = jwt.get_unverified_header(token)
    claims = jwt.decode(token, options={"verify_signature": False})
    assert header == {"alg": "HS256", "typ": "JWT"}
    assert claims["iss"] == "api-concepts" and claims["aud"] == "api-concepts-clients"
    assert claims["sub"] == "admin"
    assert claims["scope"].split() == [
        "products:read", "products:write", "orders:read", "orders:write", "admin",
    ]  # fmt: skip
    assert claims["exp"] - claims["iat"] == 900
    assert uuid.UUID(claims["jti"])
    assert (
        claims["jti"]
        != jwt.decode(await stack.token("admin"), options={"verify_signature": False})["jti"]
    )


async def test_13_client_credentials_via_basic_auth_and_form_fields(stack: Stack):
    basic = await stack.http.post(
        "/oauth/token", data={"grant_type": "client_credentials"}, auth=("reader", "reader-secret")
    )
    assert basic.status_code == 200
    assert basic.headers["cache-control"] == "no-store"
    assert basic.json() | {"access_token": "..."} == {
        "access_token": "...", "token_type": "Bearer", "expires_in": 900,
        "scope": "products:read orders:read",
    }  # fmt: skip

    post = await stack.http.post(
        "/oauth/token",
        data={
            "grant_type": "client_credentials", "client_id": "free", "client_secret": "free-secret",
            "scope": "products:read",
        },
    )  # fmt: skip
    assert post.status_code == 200 and post.json()["scope"] == "products:read"


async def test_13_oauth_errors_follow_rfc_6749(stack: Stack):
    wrong_secret = await stack.http.post(
        "/oauth/token", data={"grant_type": "client_credentials"}, auth=("reader", "nope")
    )
    assert wrong_secret.status_code == 401
    assert wrong_secret.json()["error"] == "invalid_client"
    assert wrong_secret.headers["www-authenticate"] == 'Basic realm="api-concepts"'

    auth = ("reader", "reader-secret")
    grant = await stack.http.post("/oauth/token", data={"grant_type": "password"}, auth=auth)
    assert (grant.status_code, grant.json()["error"]) == (400, "unsupported_grant_type")

    scope = await stack.http.post(
        "/oauth/token", data={"grant_type": "client_credentials", "scope": "admin"}, auth=auth
    )
    assert (scope.status_code, scope.json()["error"]) == (400, "invalid_scope")

    missing = await stack.http.post("/oauth/token", data={}, auth=auth)
    assert (missing.status_code, missing.json()["error"]) == (400, "invalid_request")


async def test_14_hsts_is_sent_only_when_the_request_arrived_over_https(stack: Stack):
    plain = await stack.http.get("/health")
    assert "strict-transport-security" not in plain.headers

    forwarded = await stack.http.get("/health", headers={"X-Forwarded-Proto": "https"})
    assert forwarded.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"

    http_only = await stack.http.get("/health", headers={"X-Forwarded-Proto": "http"})
    assert "strict-transport-security" not in http_only.headers


async def test_15_preflight_from_an_allowed_origin_skips_auth(stack: Stack):
    response = await stack.http.options(
        "/v1/products",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )
    assert response.status_code in (200, 204)
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert {"GET", "POST", "PUT", "PATCH", "DELETE"} <= set(
        response.headers["access-control-allow-methods"].replace(" ", "").split(",")
    )
    allowed = response.headers["access-control-allow-headers"].lower()
    for name in (
        "authorization",
        "content-type",
        "idempotency-key",
        "if-match",
        "if-none-match",
        "x-request-id",
    ):
        assert name in allowed
    assert response.headers["access-control-max-age"] == "600"
    assert "access-control-allow-credentials" not in response.headers
    assert "x-request-id" in response.headers


async def test_15_actual_request_exposes_headers_and_other_origins_get_nothing(stack: Stack):
    headers = await stack.auth("reader")
    allowed = await stack.http.get(
        "/v1/products", headers={**headers, "Origin": "http://localhost:5173"}
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "origin" in allowed.headers["vary"].lower()
    exposed = allowed.headers["access-control-expose-headers"].lower()
    for name in ("etag", "link", "location", "retry-after", "ratelimit-limit", "ratelimit-remaining",
                 "ratelimit-reset", "x-request-id", "idempotent-replayed"):  # fmt: skip
        assert name in exposed
    assert "access-control-allow-credentials" not in allowed.headers

    denied = await stack.http.get(
        "/v1/products", headers={**headers, "Origin": "https://evil.example"}
    )
    assert "access-control-allow-origin" not in denied.headers
