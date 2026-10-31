"""Concept 27: RFC 9457 problem details everywhere."""

import logging

import pytest

from tests.helpers import Stack


async def test_27_every_error_is_problem_json_with_request_id_and_instance(stack: Stack):
    response = await stack.http.get("/v1/products/prd_zz?x=1", headers=await stack.auth("reader"))

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json() == {
        "type": "/problems/not-found",
        "title": "Resource not found",
        "status": 404,
        "detail": "Product 'prd_zz' does not exist.",
        "instance": "/v1/products/prd_zz",  # no query string
        "requestId": response.headers["x-request-id"],
    }


async def test_27_unknown_routes_and_wrong_methods_are_problems_too(stack: Stack):
    unknown = await stack.http.get("/v1/nothing-here")
    assert unknown.status_code == 404 and unknown.json()["type"] == "/problems/not-found"

    wrong = await stack.http.delete("/health")
    assert wrong.status_code == 405
    assert wrong.headers["content-type"].startswith("application/problem+json")
    assert "allow" in wrong.headers

    slash = await stack.http.get("/v1/products/", headers=await stack.auth("reader"))
    assert slash.status_code == 404  # no silent redirects


async def test_27_validation_errors_carry_a_field_list(stack: Stack):
    response = await stack.http.post(
        "/v1/products", json={"title": "", "priceCents": -1}, headers=await stack.auth("writer")
    )
    body = response.json()
    assert response.status_code == 400 and body["type"] == "/problems/validation-error"
    assert {e["field"] for e in body["errors"]} == {"title", "author", "priceCents"}
    assert all(set(e) == {"field", "message"} for e in body["errors"])
    assert "errors" not in (await stack.http.get("/v1/nothing")).json()


async def test_27_unhandled_exceptions_become_a_generic_500_and_are_logged(
    stack: Stack, caplog: pytest.LogCaptureFixture
):
    with caplog.at_level(logging.ERROR):
        response = await stack.http.get("/v1/demo/crash", headers=await stack.auth("reader"))

    body = response.json()
    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/problem+json")
    assert body["type"] == "/problems/internal-error"
    assert body["detail"] == "An unexpected error occurred."
    assert "deliberate crash" not in response.text and "Traceback" not in response.text
    assert response.headers["x-request-id"] == body["requestId"]
    # The real exception went to the log, tagged with the same request id.
    record = next(r for r in caplog.records if r.name == "api.error")
    assert record.__dict__["request_id"] == body["requestId"]
    assert "deliberate crash" in caplog.text
    assert response.headers["ratelimit-limit"] == "1000"  # context headers survive the crash


async def test_27_flaky_endpoint_fails_then_recovers_per_key(stack: Stack):
    headers = await stack.auth("reader")
    codes = [
        (await stack.http.get("/v1/demo/flaky?key=a&failTimes=2", headers=headers))
        for _ in range(3)
    ]
    assert [c.status_code for c in codes] == [503, 503, 200]
    assert codes[0].json()["type"] == "/problems/service-unavailable"
    assert "retry-after" not in codes[0].headers
    assert codes[2].json() == {"key": "a", "attempts": 3}
    other = await stack.http.get("/v1/demo/flaky?key=b&failTimes=0", headers=headers)
    assert other.json() == {"key": "b", "attempts": 1}
    invalid = await stack.http.get("/v1/demo/flaky?failTimes=11&key=c", headers=headers)
    assert invalid.status_code == 400
