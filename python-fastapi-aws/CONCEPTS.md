# Concepts map

Where each of the 27 API concepts lives in this stack (Python, FastAPI, Pydantic v2, Strawberry, PyJWT, httpx, Mangum). `$TOKEN` is an access token from the README's "Try it" section.

| # | Concept | Code | Tests | Try it |
|---|---|---|---|---|
| 1 | Requests and responses | [echo.py](app/routes/echo.py#L17)<br>[middleware.py](app/web/middleware.py#L47) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_01_echo_returns_request_details_and_masks_the_token`<br>`test_01_echo_get_has_null_body`<br>`test_01_access_log_is_one_json_line_without_secrets` | `curl -s -X POST 'localhost:8001/v1/echo?a=1' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"hi":1}'` |
| 2 | Endpoints | [main.py](app/main.py#L55)<br>[system.py](app/routes/system.py#L12) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_02_resources_are_routed_under_v1` | `curl -s localhost:8001/` |
| 3 | HTTP methods | [products.py (patch)](app/routes/products.py#L137)<br>[products.py (service)](app/services/products.py#L11) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_03_http_methods_create_replace_patch_delete_a_product`<br>`test_03_put_requires_every_field` | `curl -s -X PATCH localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"priceCents":3000}'` |
| 4 | Headers | [middleware.py](app/web/middleware.py#L47)<br>[body.py](app/web/body.py#L21) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_04_request_id_is_echoed_when_valid_and_generated_otherwise`<br>`test_04_wrong_content_type_returns_415`<br>`test_04_merge_patch_content_type_is_accepted_on_patch`<br>`test_04_security_headers_are_on_every_response`<br>`test_04_location_header_points_at_the_new_resource` | `curl -si localhost:8001/health -H 'X-Request-Id: my-trace-1' \| head -12` |
| 5 | Path and query parameters | [products.py](app/routes/products.py#L57)<br>[products.py (get)](app/routes/products.py#L84) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_05_path_and_query_parameters_select_and_filter`<br>`test_05_invalid_query_parameter_returns_400_validation_error` | `curl -s 'localhost:8001/v1/products?tag=reliability&limit=3' -H "Authorization: Bearer $TOKEN"` |
| 6 | Request bodies | [body.py](app/web/body.py#L41)<br>[products.py (models)](app/models/products.py#L25) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_06_invalid_body_lists_every_failing_field`<br>`test_06_malformed_json_returns_400`<br>`test_06_unknown_properties_are_ignored_and_strings_are_trimmed` | `curl -s -X POST localhost:8001/v1/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":""}'` |
| 7 | JSON and serialization | [base.py](app/models/base.py#L14)<br>[timefmt.py](app/timefmt.py#L10) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_07_json_is_camel_case_with_integer_cents_and_utc_milliseconds`<br>`test_07_nullable_fields_are_present_as_null` | `curl -s localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN"` |
| 8 | API schemas | [docs.py](app/web/docs.py#L28)<br>[main.py](app/main.py#L55) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_08_openapi_document_describes_routes_and_bodies` | `curl -s localhost:8001/openapi.json \| head -c 400; open http://localhost:8001/docs` |
| 9 | Status codes | [problems.py](app/web/problems.py#L12)<br>[errors.py](app/web/errors.py#L38) | [test_http_basics.py](tests/test_http_basics.py):<br>`test_09_status_codes_follow_the_contract` | `curl -s -o /dev/null -w '%{http_code}\n' localhost:8001/v1/products/nope -H "Authorization: Bearer $TOKEN"` |
| 10 | Authentication | [dependencies.py](app/auth/dependencies.py#L25)<br>[tokens.py](app/auth/tokens.py#L64) | [test_security.py](tests/test_security.py):<br>`test_10_missing_token_returns_401_with_a_bearer_challenge`<br>`test_10_rejected_tokens_return_401_invalid_token`<br>`test_10_a_valid_token_identifies_the_caller` | `curl -si localhost:8001/v1/me \| head -5` |
| 11 | Authorization | [dependencies.py](app/auth/dependencies.py#L58)<br>[orders.py](app/routes/orders.py#L41) | [test_security.py](tests/test_security.py):<br>`test_11_missing_scope_returns_403_naming_the_scope`<br>`test_11_another_clients_order_is_404_but_admin_can_read_it` | `curl -si -X DELETE localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" \| head -8` |
| 12 | Access tokens and JWT | [tokens.py](app/auth/tokens.py#L31) | [test_security.py](tests/test_security.py):<br>`test_12_access_token_is_an_hs256_jwt_with_the_required_claims` | `echo $TOKEN \| cut -d. -f2 \| base64 -d 2>/dev/null; echo` |
| 13 | OAuth 2.0 | [oauth.py](app/auth/oauth.py#L87) | [test_security.py](tests/test_security.py):<br>`test_13_client_credentials_via_basic_auth_and_form_fields`<br>`test_13_oauth_errors_follow_rfc_6749` | `curl -s -u reader:reader-secret -d grant_type=client_credentials localhost:8001/oauth/token` |
| 14 | HTTPS | [middleware.py](app/web/middleware.py#L37) | [test_security.py](tests/test_security.py):<br>`test_14_hsts_is_sent_only_when_the_request_arrived_over_https` | `curl -si localhost:8001/health -H 'X-Forwarded-Proto: https' \| grep -i strict` |
| 15 | CORS | [main.py](app/main.py#L23)<br>[main.py (middleware)](app/main.py#L80) | [test_security.py](tests/test_security.py):<br>`test_15_preflight_from_an_allowed_origin_skips_auth`<br>`test_15_actual_request_exposes_headers_and_other_origins_get_nothing` | `curl -si -X OPTIONS localhost:8001/v1/products -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: GET'` |
| 16 | REST | [products.py](app/routes/products.py#L101)<br>[pagination.py](app/web/pagination.py#L77) | [test_products.py](tests/test_products.py):<br>`test_16_rest_links_location_on_create_and_next_on_lists` | `curl -si -X POST localhost:8001/v1/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"T","author":"A","priceCents":1}' \| grep -i location` |
| 17 | GraphQL | [schema.py](app/gql/schema.py#L104)<br>[graphql.py](app/routes/graphql.py#L28) | [test_graphql.py](tests/test_graphql.py):<br>`test_17_nested_query_reaches_from_order_to_product`<br>`test_17_products_connection_pages_with_end_cursor`<br>`test_17_single_product_and_missing_product`<br>`test_17_order_without_orders_read_scope_is_forbidden`<br>`test_17_another_clients_order_is_null`<br>`test_17_page_size_outside_1_to_50_is_a_bad_user_input_error`<br>`test_17_graphql_endpoint_is_authenticated_like_rest`<br>`test_17_invalid_queries_report_errors_without_data` | `curl -s localhost:8001/graphql -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"query":"{ product(id: \\"prd_01\\") { title } }"}'` |
| 18 | Pagination | [pagination.py](app/web/pagination.py#L34)<br>[products.py (repo)](app/repositories/products.py#L38) | [test_products.py](tests/test_products.py):<br>`test_18_cursor_pagination_walks_all_25_seeds_exactly_once`<br>`test_18_new_products_sort_last_and_cursors_survive_inserts`<br>`test_18_undecodable_cursor_returns_400_invalid_cursor` | `curl -si 'localhost:8001/v1/products?limit=2' -H "Authorization: Bearer $TOKEN" \| grep -iE 'link\|nextCursor'` |
| 19 | Caching | [etag.py](app/web/etag.py#L6)<br>[products.py](app/routes/products.py#L84) | [test_products.py](tests/test_products.py):<br>`test_19_if_none_match_returns_304_with_no_body`<br>`test_19_list_has_a_weak_etag_and_revalidates_to_304`<br>`test_19_etag_changes_after_an_update`<br>`test_19_if_match_mismatch_returns_412_and_match_succeeds`<br>`test_19_responses_without_a_cache_policy_default_to_no_store` | `curl -si localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" -H 'If-None-Match: "prd_01-v1"'` |
| 20 | Rate limiting | [ratelimit.py](app/auth/ratelimit.py#L34) | [test_limits.py](tests/test_limits.py):<br>`test_20_rate_limit_returns_429_with_retry_after`<br>`test_20_ratelimit_headers_count_down_on_every_authenticated_response`<br>`test_20_bucket_refills_continuously_and_is_per_client`<br>`test_20_unauthenticated_and_health_requests_are_not_counted` | `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' localhost:8001/v1/products -H "Authorization: Bearer $(curl -s -u free:free-secret -d grant_type=client_credentials localhost:8001/oauth/token \| python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')"; done` |
| 21 | Throttling | [throttle.py](app/services/throttle.py#L9)<br>[template.yaml](infra/aws/template.yaml) | [test_limits.py](tests/test_limits.py):<br>`test_21_report_queue_runs_two_queues_two_and_rejects_the_rest`<br>`test_21_throttled_response_is_a_problem`<br>`test_21_report_totals_only_paid_orders` | `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' 'localhost:8001/v1/reports/sales?delayMs=1000' -H "Authorization: Bearer $TOKEN" & done; wait` |
| 22 | Idempotency | [idempotency.py](app/repositories/idempotency.py#L47)<br>[orders.py](app/routes/orders.py#L59) | [test_orders.py](tests/test_orders.py):<br>`test_22_order_totals_are_computed_from_current_prices`<br>`test_22_same_key_and_body_replays_the_first_response`<br>`test_22_same_key_with_a_different_body_returns_422`<br>`test_22_keys_are_scoped_to_the_client`<br>`test_22_missing_or_oversized_key_returns_400`<br>`test_22_same_key_while_the_first_is_in_flight_returns_409`<br>`test_22_failed_attempts_are_not_remembered`<br>`test_22_order_validation_and_payment` | `for i in 1 2; do curl -si -X POST localhost:8001/v1/orders -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: demo-1' -H 'Content-Type: application/json' -d '{"items":[{"productId":"prd_01","quantity":1}]}' \| grep -iE 'HTTP/\|replayed'; done` |
| 23 | Retries | [client.py](bookshop_client/client.py#L102)<br>[retry_demo.py](examples/retry_demo.py) | [test_client.py](tests/test_client.py):<br>`test_23_safe_failures_are_retried_until_success`<br>`test_23_gives_up_after_three_retries_with_a_typed_error`<br>`test_23_other_errors_are_never_retried`<br>`test_23_every_retryable_status_is_retried`<br>`test_23_post_without_an_idempotency_key_is_not_retried`<br>`test_23_create_order_retries_with_one_idempotency_key`<br>`test_23_network_errors_are_retried`<br>`test_23_token_is_cached_between_calls`<br>`test_23_retry_after_header_overrides_the_backoff_schedule`<br>`test_23_client_honours_the_servers_429_retry_after` | `python -m examples.retry_demo` |
| 24 | Timeouts | [reports.py](app/services/reports.py#L14)<br>[client.py](bookshop_client/client.py#L156) | [test_client.py](tests/test_client.py), [test_limits.py](tests/test_limits.py):<br>`test_24_each_attempt_has_its_own_timeout`<br>`test_24_timeouts_exhaust_into_an_api_error_without_a_problem`<br>`test_24_slow_report_is_cancelled_with_504_at_the_deadline`<br>`test_24_delay_ms_is_validated` | `curl -s 'localhost:8001/v1/reports/sales?delayMs=5000' -H "Authorization: Bearer $TOKEN"` |
| 25 | Exponential backoff | [client.py](bookshop_client/client.py#L30)<br>[webhooks.py](app/services/webhooks.py#L28) | [test_client.py](tests/test_client.py), [test_webhooks.py](tests/test_webhooks.py):<br>`test_25_backoff_doubles_each_retry_and_is_capped`<br>`test_25_client_waits_the_backoff_delays_between_retries`<br>`test_25_client_against_the_real_flaky_endpoint`<br>`test_25_webhook_retry_delay_doubles_with_jitter_and_is_capped`<br>`test_25_dispatcher_sleeps_with_growing_delays_between_attempts` | `python -m examples.retry_demo` |
| 26 | Webhooks | [webhooks.py](app/services/webhooks.py#L34)<br>[signature.py](app/web/signature.py#L22) | [test_webhooks.py](tests/test_webhooks.py):<br>`test_26_subscription_secret_is_shown_once_and_admin_only`<br>`test_26_subscription_validation`<br>`test_26_delivery_is_signed_and_verifiable_by_the_receiver`<br>`test_26_only_subscribed_event_types_are_delivered`<br>`test_26_failed_delivery_is_retried_and_logged`<br>`test_26_delivery_gives_up_after_the_maximum_attempts`<br>`test_26_network_errors_are_recorded_and_retried`<br>`test_26_replayed_order_creation_emits_no_second_event`<br>`test_26_paying_twice_emits_one_event`<br>`test_26_verify_signature_rejects_tampering_and_stale_timestamps` | `curl -s -X POST localhost:8001/v1/webhooks -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"url":"https://example.com/hook","events":["order.paid"]}'` |
| 27 | Error handling | [problems.py](app/web/problems.py#L40)<br>[errors.py](app/web/errors.py#L38)<br>[middleware.py](app/web/middleware.py#L101) | [test_errors.py](tests/test_errors.py):<br>`test_27_every_error_is_problem_json_with_request_id_and_instance`<br>`test_27_unknown_routes_and_wrong_methods_are_problems_too`<br>`test_27_validation_errors_carry_a_field_list`<br>`test_27_unhandled_exceptions_become_a_generic_500_and_are_logged`<br>`test_27_flaky_endpoint_fails_then_recovers_per_key` | `curl -si localhost:8001/v1/demo/crash -H "Authorization: Bearer $TOKEN"` |

## How each concept is implemented

### 1. Requests and responses

`GET|POST /v1/echo` reads the method, path, first query values, headers and parsed body straight from Starlette's `Request`, masking the token. The `RequestContext` ASGI middleware writes one JSON access log line per request (`ts`, `requestId`, `status`, `durationMs`, `clientId`) and never touches tokens or bodies. Pure ASGI middleware, not `BaseHTTPMiddleware`, so streaming and cancellation behave.

### 2. Endpoints

Each resource is an `APIRouter` with a prefix (`/v1/products`, `/v1/orders`, ...) and the app factory `create_app` includes them all. `redirect_slashes=False` means `/v1/products/` is a plain 404 instead of a silent redirect, so every URL has exactly one spelling.

### 3. HTTP methods

Products use `@router.get/post/put/patch/delete`. PUT validates a model where every field is required (`ProductReplace`), PATCH a model where every field is optional and only fields in `model_fields_set` change (`ProductPatch`, with `exclude_unset`). Every change bumps `version`, which also drives the ETag.

### 4. Headers

`RequestContext` echoes a valid `X-Request-Id` (regex `^[A-Za-z0-9._-]{1,128}$`) or mints a UUID, and adds the security headers on every response, including 404s and 500s, by wrapping the ASGI `send`. The `Content-Type` rule (415) lives in `read_json`, because FastAPI would otherwise parse bodies before any dependency can run.

### 5. Path and query parameters

Path parameters are function arguments; query parameters use `Annotated[int, Query(ge=1, le=50)]`, so bounds are declared once and show up in the OpenAPI document. A failed check raises `RequestValidationError`, which `errors.py` converts into the 400 problem with a per-field list.

### 6. Request bodies

Bodies are Pydantic v2 models with `StringConstraints`, strict integers for cents and a unique-tags validator. `json_body(Model)` is a dependency factory that runs after authentication, so the order is 401, 415, malformed JSON 400, then schema 400. Unknown properties are ignored via `extra="ignore"`.

### 7. JSON and serialization

`ApiModel` uses `alias_generator=to_camel` plus `serialize_by_alias=True`, so Python stays snake_case while the wire is camelCase. `UtcTimestamp` is an `Annotated[datetime, PlainSerializer(...)]` that always writes `2026-01-01T00:00:00.000Z`. Money is an integer `priceCents`; nullable fields stay present as `null`.

### 8. API schemas

FastAPI generates `/openapi.json` and the Swagger UI at `/docs` from the route signatures. Because bodies are read by `json_body` rather than declared parameters, `docs.py` registers those models in `components.schemas` and points each route's `requestBody` at them, so the document still describes every payload. `HTTPBearer` adds the Authorize button.

### 9. Status codes

A single `CATALOGUE` maps each problem slug to its status and title, so a status code is never chosen ad hoc in a route. Success statuses use `status_code=` on the decorator or an explicit `Response` for 304 and 204. The default 422 of FastAPI is replaced by the contract's 400.

### 10. Authentication

`require(scope)` is a dependency factory built on `HTTPBearer(auto_error=False)`. It verifies the JWT, then raises a `Problem` with the right `WWW-Authenticate` challenge (`error="invalid_token"` only when a token was actually sent). Auth, rate limiting and the scope check live in one dependency so their order is explicit.

### 11. Authorization

Scopes are checked in the same dependency (403 with `error="insufficient_scope"`). Ownership is checked in `_visible_order`: another client's order is reported as 404, not 403, so ids cannot be probed. The admin scope lifts both the order list filter and the ownership check.

### 12. Access tokens and JWT

`TokenService` signs with PyJWT (`HS256`, header `typ: JWT`) and verifies with `algorithms=["HS256"]` pinned, `leeway=0`, and `iss`, `aud`, `exp`, `iat`, `sub` required. The dependency never trusts the token's `scope` for the plan: it looks the client up again, so a token for an unknown client is rejected.

### 13. OAuth 2.0

The client-credentials grant accepts `client_secret_basic` and `client_secret_post`, compares secrets with `hmac.compare_digest`, and returns RFC 6749 errors (not problem+json) with `Cache-Control: no-store`. The form body is parsed with the standard library, so no `python-multipart` dependency is needed.

### 14. HTTPS

TLS ends at API Gateway, which tells the function via `X-Forwarded-Proto`. `_is_https` also honours the ASGI `scheme`, and HSTS is added only when one of them says https. Plain HTTP never gets the header.

### 15. CORS

Starlette's `CORSMiddleware` is configured with the `CORS_ORIGINS` allowlist, the exact allowed and exposed header lists, `max_age=600` and no credentials. It sits inside `RequestContext` and outside the routes, so preflights skip authentication and rate limiting but still carry `X-Request-Id`.

### 16. REST

Resources are nouns with a uniform interface; create answers 201 with `Location`, lists carry `Link: rel="next"` built by `next_link`. Orders hang their one non-CRUD action off the resource as `POST /v1/orders/{id}/pay`.

### 17. GraphQL

A Strawberry schema with `snake_case` fields exposed as camelCase, executed from a plain FastAPI route so the same auth, rate limiting and problem responses apply. `OrderItem.product` is an async resolver that reads the repository. `order` checks `orders:read` in the resolver and raises a `GraphQLError` with `extensions.code = FORBIDDEN`; `QueryDepthLimiter` bounds abusive queries.

### 18. Pagination

Keyset pagination: the cursor is base64url JSON of the last `(createdAt, id)` returned, and the repository returns rows strictly after it. Fetching `limit + 1` rows tells `make_page` whether there is a next page without a count query. Undecodable cursors raise the `invalid-cursor` problem.

### 19. Caching

Single products have a strong ETag `"<id>-v<version>"`; the list has a weak ETag hashed from the response body. `If-None-Match` uses weak comparison and returns a bodiless 304, `If-Match` uses strong comparison and yields 412 on mismatch. `RequestContext` adds `Cache-Control: no-store` to any `/v1`, `/graphql` or `/oauth` response that did not choose a policy.

### 20. Rate limiting

`TokenBucketLimiter` keeps a float token count per client, refilled continuously at `limit/60` per second from an injectable clock. The decision object renders the three `RateLimit-*` headers, which the dependency stores on the request state and `RequestContext` copies onto every response, errors included. State is per process; see Production notes.

### 21. Throttling

`ConcurrencyGate` wraps an `asyncio.Semaphore(2)` (FIFO wake-up) and a waiting counter capped at 2: a request that finds the semaphore locked and two waiters is refused at once with 503 `throttled`. The cloud counterpart is the API Gateway stage throttling (`ThrottlingRateLimit` / `ThrottlingBurstLimit`) in the SAM template.

### 22. Idempotency

`begin` atomically claims `(client, key)` and returns `Started`, `Replay`, `InProgress` or `Reused`; the route handles each with a `match` statement. Only a 201 is stored, keyed to the SHA-256 of the raw body, for 24 hours, and a failed first attempt releases the key. Replays return the stored bytes and `Location` plus `Idempotent-Replayed: true` and emit no webhook.

### 23. Retries

`BookshopClient.request` loops over attempts and retries only network errors, timeouts and 408/429/502/503/504, and only for idempotent methods or POSTs carrying an `Idempotency-Key`. `create_order` generates one UUID key per call and reuses it on every attempt. When retries run out it raises `ApiError` carrying the server's problem details.

### 24. Timeouts

The report is wrapped in `asyncio.wait_for(..., REQUEST_TIMEOUT_MS)`; on expiry the job is cancelled (freeing its throttle slot) and a 504 `timeout` problem is returned at that moment. The client bounds each attempt with `asyncio.timeout`, so a hung connection counts as one failed attempt and is retried.

### 25. Exponential backoff

Both the client and the webhook dispatcher compute `random(0.5, 1.0) x min(cap, base x 2^(n-1))`. Base, cap, jitter source and sleep function are injectable, so tests assert exact delays without waiting. A server `Retry-After` always wins over the computed delay in the client.

### 26. Webhooks

`WebhookDispatcher.publish` records a pending delivery per subscriber and starts `asyncio.create_task` workers so the API response never waits. Each attempt signs `<timestamp>.<raw body>` with HMAC-SHA256 using `httpx.AsyncClient` (5 s timeout), retries with backoff, and updates the delivery log. `verify_signature` is the receiver-side helper: constant-time compare plus a 300 s timestamp window.

### 27. Error handling

Routes raise `Problem(slug, detail)`; three exception handlers turn `Problem`, `RequestValidationError` and Starlette's `HTTPException` into `application/problem+json` with `requestId` and `instance`. `CrashGuard`, the innermost middleware, catches everything else, logs the traceback with the request id and answers a fixed `An unexpected error occurred.`
