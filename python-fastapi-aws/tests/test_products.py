"""Concepts 16, 18, 19: REST links, cursor pagination and HTTP caching."""

from urllib.parse import parse_qs, urlsplit

from tests.helpers import Stack


async def test_16_rest_links_location_on_create_and_next_on_lists(stack: Stack):
    writer = await stack.auth("writer")
    created = await stack.http.post(
        "/v1/products", json={"title": "T", "author": "A", "priceCents": 1}, headers=writer
    )
    assert created.headers["location"].startswith("/v1/products/prd_")

    page = await stack.http.get("/v1/products?limit=2&tag=design", headers=writer)
    link = page.headers["link"]
    assert link.endswith('; rel="next"')
    target = urlsplit(link[1 : link.index(">")])
    assert target.path == "/v1/products"
    assert parse_qs(target.query)["tag"] == ["design"] and parse_qs(target.query)["limit"] == ["2"]


async def test_18_cursor_pagination_walks_all_25_seeds_exactly_once(stack: Stack):
    headers = await stack.auth("reader")
    seen: list[str] = []
    url: str | None = "/v1/products?limit=10"
    pages = 0
    while url:
        response = await stack.http.get(url, headers=headers)
        body = response.json()
        seen += [p["id"] for p in body["data"]]
        pages += 1
        if body["page"]["hasMore"]:
            assert body["page"]["nextCursor"]
            link = response.headers["link"]
            url = link[1 : link.index(">")]
        else:
            assert body["page"]["nextCursor"] is None
            assert "link" not in response.headers
            url = None
    assert pages == 3
    assert seen == [f"prd_{n:02d}" for n in range(1, 26)]


async def test_18_new_products_sort_last_and_cursors_survive_inserts(stack: Stack):
    headers = await stack.auth("writer")
    first = (await stack.http.get("/v1/products?limit=24", headers=headers)).json()
    created = await stack.http.post(
        "/v1/products", json={"title": "Late", "author": "A", "priceCents": 1}, headers=headers
    )
    second = (
        await stack.http.get(
            f"/v1/products?limit=24&cursor={first['page']['nextCursor']}", headers=headers
        )
    ).json()
    assert [p["id"] for p in second["data"]] == ["prd_25", created.json()["id"]]


async def test_18_undecodable_cursor_returns_400_invalid_cursor(stack: Stack):
    for bad in ("not-a-cursor", "e30", "!!!"):
        response = await stack.http.get(
            f"/v1/products?cursor={bad}", headers=await stack.auth("reader")
        )
        assert response.status_code == 400
        assert response.json()["type"] == "/problems/invalid-cursor"


async def test_19_if_none_match_returns_304_with_no_body(stack: Stack):
    headers = await stack.auth("reader")
    first = await stack.http.get("/v1/products/prd_03", headers=headers)
    assert first.headers["etag"] == '"prd_03-v1"'
    assert first.headers["cache-control"] == "private, max-age=60"

    for validator in ('"prd_03-v1"', '"other", "prd_03-v1"', "*"):
        cached = await stack.http.get(
            "/v1/products/prd_03", headers={**headers, "If-None-Match": validator}
        )
        assert cached.status_code == 304
        assert cached.content == b""
        assert cached.headers["etag"] == '"prd_03-v1"'
        assert cached.headers["cache-control"] == "private, max-age=60"

    stale = await stack.http.get(
        "/v1/products/prd_03", headers={**headers, "If-None-Match": '"prd_03-v0"'}
    )
    assert stale.status_code == 200


async def test_19_list_has_a_weak_etag_and_revalidates_to_304(stack: Stack):
    headers = await stack.auth("reader")
    first = await stack.http.get("/v1/products", headers=headers)
    etag = first.headers["etag"]
    assert etag.startswith('W/"') and first.headers["cache-control"] == "private, max-age=30"
    again = await stack.http.get("/v1/products", headers={**headers, "If-None-Match": etag})
    assert again.status_code == 304 and again.headers["etag"] == etag


async def test_19_etag_changes_after_an_update(stack: Stack):
    writer = await stack.auth("writer")
    await stack.http.patch("/v1/products/prd_03", json={"priceCents": 1}, headers=writer)
    response = await stack.http.get("/v1/products/prd_03", headers=writer)
    assert response.headers["etag"] == '"prd_03-v2"'


async def test_19_if_match_mismatch_returns_412_and_match_succeeds(stack: Stack):
    writer = await stack.auth("writer")
    stale = await stack.http.patch(
        "/v1/products/prd_04", json={"priceCents": 1}, headers={**writer, "If-Match": '"prd_04-v9"'}
    )
    assert stale.status_code == 412
    assert stale.json()["type"] == "/problems/precondition-failed"

    ok = await stack.http.patch(
        "/v1/products/prd_04", json={"priceCents": 1}, headers={**writer, "If-Match": '"prd_04-v1"'}
    )
    assert ok.status_code == 200 and ok.headers["etag"] == '"prd_04-v2"'

    # The ETag moved on, so replaying the same If-Match now fails: no lost updates.
    replay = await stack.http.put(
        "/v1/products/prd_04",
        json={"title": "T", "author": "A", "priceCents": 1, "tags": []},
        headers={**writer, "If-Match": '"prd_04-v1"'},
    )
    assert replay.status_code == 412

    delete = await stack.http.delete(
        "/v1/products/prd_04", headers={**await stack.auth("admin"), "If-Match": '"prd_04-v1"'}
    )
    assert delete.status_code == 412


async def test_19_responses_without_a_cache_policy_default_to_no_store(stack: Stack):
    me = await stack.http.get("/v1/me", headers=await stack.auth("reader"))
    assert me.headers["cache-control"] == "no-store"
    assert "cache-control" not in (await stack.http.get("/health")).headers
