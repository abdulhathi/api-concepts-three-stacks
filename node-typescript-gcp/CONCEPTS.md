# Concepts map

Where each of the 27 API concepts lives in this stack (Node.js, TypeScript, Express 5), the tests that prove it, and one
command to see it working. Paths are relative to this folder; line anchors point at the code that matters.

## Set up the try-it commands

Start the server (`npm run dev`, port 8002) and get a token. Every `curl` below assumes these two variables.

```bash
TOKEN=$(curl -s -u admin:admin-secret -d grant_type=client_credentials localhost:8002/oauth/token | jq -r .access_token)
AUTH="Authorization: Bearer $TOKEN"
```

## Table

| # | Concept | Code | Tests | Try it |
|---|---|---|---|---|
| 1 | Requests and responses | [demo/routes.ts](src/demo/routes.ts#L51), [requestLog.ts](src/http/requestLog.ts#L7) | [01 echo returns the request as the server saw it and masks the token](tests/http-basics.test.ts#L5), [01 every request writes one JSON log line without secrets](tests/http-basics.test.ts#L17) | `curl -s "localhost:8002/v1/echo?a=1" -H "$AUTH"` |
| 2 | Endpoints | [app.ts](src/app.ts#L88), [products/repository.ts](src/products/repository.ts#L5) | [02 resource routes live under /v1 and the root document links to docs](tests/http-basics.test.ts#L28) | `curl -s localhost:8002/` |
| 3 | HTTP methods | [products/routes.ts](src/products/routes.ts#L47) | [03 methods map to read, create, replace, patch and delete on products](tests/http-basics.test.ts#L34) | `curl -s -X PATCH localhost:8002/v1/products/prd_01 -H "$AUTH" -H 'Content-Type: application/json' -d '{"priceCents":3000}'` |
| 4 | Headers | [requestContext.ts](src/http/requestContext.ts#L21), [body.ts](src/http/body.ts#L1), [securityHeaders.ts](src/http/securityHeaders.ts#L11) | [04 X-Request-Id is echoed when valid and generated otherwise, even on 404s](tests/http-basics.test.ts#L47), [04 wrong Content-Type is 415 and a malformed body is 400](tests/http-basics.test.ts#L54), [04 create returns a Location header](tests/http-basics.test.ts#L67) | `curl -si localhost:8002/health -H 'X-Request-Id: demo-1'` |
| 5 | Path and query parameters | [products/schema.ts](src/products/schema.ts#L41), [validate.ts](src/http/validate.ts#L12) | [05 path and query parameters are validated](tests/http-basics.test.ts#L74) | `curl -s "localhost:8002/v1/products?tag=reliability&limit=2" -H "$AUTH"` |
| 6 | Request bodies | [body.ts](src/http/body.ts#L37), [products/schema.ts](src/products/schema.ts#L33) | [06 request bodies are validated field by field and unknown properties are ignored](tests/http-basics.test.ts#L86) | `curl -s -X POST localhost:8002/v1/products -H "$AUTH" -H 'Content-Type: application/json' -d '{"title":"","author":"A","priceCents":1.5}'` |
| 7 | JSON and serialization | [products/schema.ts](src/products/schema.ts#L1), [seed.ts](src/products/seed.ts#L34), [util/time.ts](src/util/time.ts#L6) | [07 JSON uses camelCase, integer cents, UTC timestamps and explicit nulls](tests/http-basics.test.ts#L100) | `curl -s localhost:8002/v1/products/prd_01 -H "$AUTH"` |
| 8 | API schemas | [openapi/document.ts](src/openapi/document.ts#L68) | [08 /openapi.json describes every route and reuses the validation schemas](tests/graphql-openapi.test.ts#L94), [08 /docs serves the interactive documentation UI](tests/graphql-openapi.test.ts#L112) | `curl -s localhost:8002/openapi.json \| jq '.paths \| keys'` (UI: http://localhost:8002/docs) |
| 9 | Status codes | [problem.ts](src/http/problem.ts#L24) | [09 status codes cover the success and error families](tests/http-basics.test.ts#L119) | `curl -s -o /dev/null -w '%{http_code}\n' localhost:8002/v1/me` |
| 10 | Authentication | [auth/authenticate.ts](src/auth/authenticate.ts#L10) | [10 a missing token is 401 with WWW-Authenticate](tests/auth.test.ts#L21), [10 a rejected token adds error="invalid_token"](tests/auth.test.ts#L29) | `curl -si localhost:8002/v1/me \| head -n 8` |
| 11 | Authorization | [auth/authenticate.ts](src/auth/authenticate.ts#L38), [orders/service.ts](src/orders/service.ts#L52) | [11 a token without the scope is 403 and names the scope it needed](tests/auth.test.ts#L36), [11 another client's order is 404 for everything except admin](tests/auth.test.ts#L44), [11 paying moves pending to paid once, and a second pay changes nothing](tests/orders.test.ts#L99) | `curl -si -X POST localhost:8002/v1/products -H "Authorization: Bearer $(curl -s -u reader:reader-secret -d grant_type=client_credentials localhost:8002/oauth/token \| jq -r .access_token)" -H 'Content-Type: application/json' -d '{}' \| head -n 8` |
| 12 | Access tokens and JWT | [auth/jwt.ts](src/auth/jwt.ts#L12) | [12 tokens are HS256 JWTs with the required claims](tests/auth.test.ts#L60), [12 expired, wrong-issuer, wrong-audience, badly signed and alg=none tokens are rejected](tests/auth.test.ts#L75) | `echo $TOKEN \| cut -d. -f2 \| base64 -d 2>/dev/null \| jq` |
| 13 | OAuth 2.0 | [auth/oauth.ts](src/auth/oauth.ts#L34), [clients.ts](src/auth/clients.ts#L14) | [13 client credentials work with Basic auth and with form fields](tests/auth.test.ts#L99), [13 token errors follow RFC 6749](tests/auth.test.ts#L112), [13 the client caches its token until 30 seconds before expiry](tests/client.test.ts#L152) | `curl -s -u reader:reader-secret -d grant_type=client_credentials -d scope=products:read localhost:8002/oauth/token` |
| 14 | HTTPS | [securityHeaders.ts](src/http/securityHeaders.ts#L6) | [14 HSTS is sent only when the request arrived over HTTPS](tests/http-basics.test.ts#L132) | `curl -si localhost:8002/health -H 'X-Forwarded-Proto: https' \| grep -i strict` |
| 15 | CORS | [cors.ts](src/http/cors.ts#L9) | [15 CORS preflight from an allowed origin skips auth and lists methods and headers](tests/http-basics.test.ts#L142), [15 CORS actual requests expose headers and disallowed origins get nothing](tests/http-basics.test.ts#L156) | `curl -si -X OPTIONS localhost:8002/v1/products -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST'` |
| 16 | REST | [products/routes.ts](src/products/routes.ts#L47), [pagination.ts](src/http/pagination.ts#L31) | [16 collections link to the next page and creation points at the new resource](tests/http-basics.test.ts#L166) | `curl -si "localhost:8002/v1/products?limit=2" -H "$AUTH" \| grep -i '^link'` |
| 17 | GraphQL | [graphql/schema.ts](src/graphql/schema.ts#L11), [handler.ts](src/graphql/handler.ts#L20) | [17 a nested query walks order, items and products](tests/graphql-openapi.test.ts#L9), [17 order without orders:read is a FORBIDDEN field error and data.order is null](tests/graphql-openapi.test.ts#L60), [17 first outside 1-50 and a bad cursor are BAD_USER_INPUT errors](tests/graphql-openapi.test.ts#L50) | `curl -s -X POST localhost:8002/graphql -H "$AUTH" -H 'Content-Type: application/json' -H 'Accept: application/json' -d '{"query":"{ products(first:2){ nodes{ id title } pageInfo{ endCursor hasNextPage } } }"}'` |
| 18 | Pagination | [pagination.ts](src/http/pagination.ts#L11) | [18 cursor pagination visits all 25 seeded products exactly once, in order](tests/products.test.ts#L6), [18 a cursor that does not decode is 400 invalid-cursor](tests/products.test.ts#L30), [18 cursors stay valid when new products are added](tests/products.test.ts#L37) | `curl -s "localhost:8002/v1/products?limit=3" -H "$AUTH" \| jq .page` |
| 19 | Caching | [etag.ts](src/http/etag.ts#L4), [products/routes.ts](src/products/routes.ts#L23) | [19 a product has a strong ETag and If-None-Match returns 304 without a body](tests/products.test.ts#L47), [19 the list has a weak ETag that changes when the data changes](tests/products.test.ts#L62), [19 If-Match with a stale ETag is 412 and a fresh one succeeds](tests/products.test.ts#L73) | `curl -si localhost:8002/v1/products/prd_01 -H "$AUTH" -H 'If-None-Match: "prd_01-v1"'` |
| 20 | Rate limiting | [limits/rateLimit.ts](src/limits/rateLimit.ts#L24) | [20 the free plan allows 5 requests then 429 with Retry-After and RateLimit headers](tests/reliability.test.ts#L7), [20 the bucket refills continuously with time](tests/reliability.test.ts#L36) | `FREE=$(curl -s -u free:free-secret -d grant_type=client_credentials localhost:8002/oauth/token \| jq -r .access_token); for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code}\n' localhost:8002/v1/products -H "Authorization: Bearer $FREE"; done` |
| 21 | Throttling | [limits/throttle.ts](src/limits/throttle.ts#L9), [reports/routes.ts](src/reports/routes.ts#L28) | [21 two reports run, two wait, and the fifth and sixth get 503 throttled with Retry-After](tests/reliability.test.ts#L51), [21 the throttle runs queued work in FIFO order and frees slots](tests/reliability.test.ts#L70) | `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code}\n' "localhost:8002/v1/reports/sales?delayMs=1500" -H "$AUTH" & done; wait` |
| 22 | Idempotency | [idempotency.ts](src/idempotency.ts#L27), [orders/routes.ts](src/orders/routes.ts#L16) | [22 replaying the same key and body returns the stored response without a second order](tests/orders.test.ts#L29), [22 the same key with a different body is 422 idempotency-key-reused](tests/orders.test.ts#L41), [22 a request that arrives while the first is in flight is 409 idempotency-key-in-progress](tests/orders.test.ts#L58) | `for i in 1 2; do curl -si -X POST localhost:8002/v1/orders -H "$AUTH" -H 'Idempotency-Key: demo-1' -H 'Content-Type: application/json' -d '{"items":[{"productId":"prd_01","quantity":1}]}' \| grep -iE '^(HTTP\|idempotent\|location)'; done` |
| 23 | Retries | [client/retry.ts](src/client/retry.ts#L7), [client/client.ts](src/client/client.ts#L114) | [23 retries a flaky endpoint until it succeeds](tests/client.test.ts#L27), [23 gives up after 4 attempts with a typed error carrying the problem details](tests/client.test.ts#L35), [23 createOrder reuses one Idempotency-Key on every attempt, so a lost response creates one order](tests/client.test.ts#L78) | `npm run example:retry` |
| 24 | Timeouts | [reports/routes.ts](src/reports/routes.ts#L36), [client/client.ts](src/client/client.ts#L155) | [24 a report slower than REQUEST_TIMEOUT_MS is cancelled with 504 at the deadline](tests/reliability.test.ts#L86), [24 a per-attempt timeout aborts a hung request and the next attempt can succeed](tests/client.test.ts#L127) | `curl -si "localhost:8002/v1/reports/sales?delayMs=5000" -H "$AUTH" \| head -n 1` |
| 25 | Exponential backoff | [client/retry.ts](src/client/retry.ts#L12), [webhooks/dispatcher.ts](src/webhooks/dispatcher.ts#L19) | [25 backoff doubles from the base, is jittered between 50% and 100%, and is capped](tests/client.test.ts#L102), [25 a failing receiver is retried with backoff until it succeeds](tests/webhooks.test.ts#L84), [25 retry delays double from the base, are jittered 50-100%, and are capped at 60 s](tests/webhooks.test.ts#L116) | `npm run example:retry` (prints each delay) |
| 26 | Webhooks | [webhooks/dispatcher.ts](src/webhooks/dispatcher.ts#L23), [signature.ts](src/webhooks/signature.ts#L7), [routes.ts](src/webhooks/routes.ts#L16) | [26 a created order is delivered with a signature the receiver can verify](tests/webhooks.test.ts#L37), [26 verification rejects tampering, wrong secrets and stale timestamps](tests/webhooks.test.ts#L123), [26 an unreachable receiver never slows the API response](tests/webhooks.test.ts#L106) | `curl -s -X POST localhost:8002/v1/webhooks -H "$AUTH" -H 'Content-Type: application/json' -d '{"url":"https://example.com/hook","events":["order.created"]}'` |
| 27 | Error handling | [problem.ts](src/http/problem.ts#L65), [errors.ts](src/http/errors.ts#L10) | [27 errors are problem+json with request id, instance and no internals on 500](tests/http-basics.test.ts#L172) | `curl -s localhost:8002/v1/demo/crash -H "$AUTH"` |

## How each concept is implemented

**1 Requests and responses.** `/v1/echo` returns the method, path, query, lower-cased headers and parsed body, with the
`Authorization` value masked. A small middleware in [requestLog.ts](src/http/requestLog.ts) hooks `res.on('finish')` to
write one JSON line per request (method, path, status, duration, client id), never tokens or bodies.

**2 Endpoints.** Each resource gets its own `express.Router` (products, orders, reports, webhooks), mounted under `/v1`
in [app.ts](src/app.ts). Routers receive a repository interface, so the same routes would run on Firestore or Postgres.

**3 HTTP methods.** The products router uses `get`, `post`, `put`, `patch` and `delete` with different semantics: PUT
needs every field (a full replace), PATCH takes a subset by spreading only the keys zod kept. DELETE needs the `admin`
scope. Express 5 forwards rejected promises from `async` handlers to the error handler, so there is no try/catch noise.

**4 Headers.** `X-Request-Id` is echoed only when it matches the safe pattern, otherwise a UUID is generated.
`Content-Type` is checked before the body is read (415), `Location` is set on creates, and `X-Content-Type-Options` and
`Referrer-Policy` are set on every response by one middleware.

**5 Path and query parameters.** `req.params` and `req.query` go through the same zod schemas as bodies. `z.coerce`
turns `?limit=10` into a number and `.default(10)` fills the gaps, so the handler receives typed values. Failures list
every field in the `errors` array.

**6 Request bodies.** [body.ts](src/http/body.ts) reads the raw bytes with `express.raw`, then parses JSON itself, so a
syntax error becomes `malformed-json` and the exact bytes stay available for the idempotency hash. zod strips unknown
properties and trims strings.

**7 JSON and serialization.** Money is integer cents, timestamps come from `Date.toISOString()` (always UTC with
milliseconds and `Z`), and nullable values such as `nextCursor` are written as `null`. The zod schemas double as the
documentation of each shape.

**8 API schemas.** `@asteasolutions/zod-to-openapi` turns the very zod schemas used for validation into an OpenAPI 3.1
document, so the contract cannot drift from the code. [document.ts](src/openapi/document.ts) registers every
operation with its scope and error responses; `/docs` renders Swagger UI from `/openapi.json`.

**9 Status codes.** Every code in the contract appears: 200, 201, 204, 304 (conditional GET), 400, 401, 403, 404,
409, 412, 415, 422, 429, 500, 503 and 504. The catalog in [problem.ts](src/http/problem.ts) pairs each problem slug with its
status in one place.

**10 Authentication.** `authenticate` extracts the bearer token, verifies it, and attaches a `Principal` to the request.
Failure throws an `ApiProblem` with a `WWW-Authenticate` header; `error="invalid_token"` is added only when a token was
actually sent and rejected.

**11 Authorization.** `requireScope('orders:write')` is a route-level guard that answers 403 and names the missing
scope. Ownership is a different check in `OrderService.getVisible`: a stranger's order is 404, not 403, so ids cannot be
probed.

**12 Access tokens and JWT.** [jwt.ts](src/auth/jwt.ts) uses `jose` to sign HS256 tokens with `iss`, `aud`, `sub`,
`scope`, `iat`, `exp` and `jti`. Verification pins the algorithm list to HS256 (so `alg=none` and algorithm-confusion
tokens fail), allows no clock leeway and checks issuer and audience.

**13 OAuth 2.0.** `POST /oauth/token` implements the client credentials grant with `express.urlencoded`. Client
authentication accepts HTTP Basic or form fields, secrets are compared in constant time, and errors use the RFC 6749 JSON
shape rather than problem+json. The client library caches the token until 30 seconds before it expires.

**14 HTTPS.** TLS ends at Cloud Run, so the app trusts `X-Forwarded-Proto` (or a TLS socket) to decide whether to send
`Strict-Transport-Security`. It is never sent over plain HTTP, where it would be ignored or misleading.

**15 CORS.** A hand-written middleware compares `Origin` with the `CORS_ORIGINS` allowlist. Preflights are answered
with 204 before authentication and rate limiting run. Credentials are never allowed, and `Vary: Origin` keeps caches
honest.

**16 REST.** Resources are nouns with stable URLs, state changes use the right verb, creates return `201` plus
`Location`, and collections carry an RFC 8288 `Link: rel="next"` header, so a client can follow links instead of building
URLs.

**17 GraphQL.** The schema is plain SDL built with `buildSchema`, executed by `graphql-http`'s Express handler and
resolved against the same repositories as REST. The `product` field of an order item is a function-valued property that
graphql-js's default resolver calls lazily. A missing `orders:read` scope becomes a `FORBIDDEN` field error, so the rest
of the query still returns data.

**18 Pagination.** Cursors are base64url-encoded `(createdAt, id)` keys and the page is "everything strictly after
this key", so new inserts never shift a page. Garbage cursors raise `invalid-cursor`. REST and GraphQL share the same
`paginate` function.

**19 Caching.** Single products get a strong ETag derived from id and version, lists a weak ETag hashed from the body.
[etag.ts](src/http/etag.ts) implements weak comparison for `If-None-Match` (304) and strong comparison for `If-Match`
(412). Express's built-in ETag is turned off so the logic is visible.

**20 Rate limiting.** [rateLimit.ts](src/limits/rateLimit.ts) is a token bucket per client: capacity equals the plan limit
and tokens refill continuously, computed lazily from elapsed time on each request, so no timers are needed. The clock is
injected, which makes the refill logic unit-testable without sleeping.

**21 Throttling.** `ConcurrencyThrottle` allows two running tasks and two waiting in a FIFO queue; the fifth caller
gets `ThrottleFullError`, which the route maps to 503 with `Retry-After: 1`. A finished task hands its slot directly to
the oldest waiter.

**22 Idempotency.** `IdempotencyStore.begin` is synchronous, so two requests can never both claim the same key. It
compares a SHA-256 of the raw body to tell a replay (stored 201 plus `Idempotent-Replayed: true`) from reuse (422) and
reports in-flight keys (409). Failed attempts are abandoned, so only successes are remembered, for 24 hours.

**23 Retries.** [retry.ts](src/client/retry.ts) holds the policy: retry on network errors, timeouts and 408/429/502/503/504,
and only for idempotent methods or a POST with an `Idempotency-Key`. `createOrder` generates one UUID per call and reuses
it on every attempt.

**24 Timeouts.** On the server, `AbortSignal.timeout` starts when a report begins running; aborting the cancellable
`sleep` frees the throttle slot and produces 504 at that moment. The client sets the same kind of signal per attempt
(default 5 s), and `fetch` aborts the socket.

**25 Exponential backoff.** `random(0.5, 1.0) x min(cap, base x 2^(n-1))` is used by both the client (base 200 ms, cap 5 s)
and webhook delivery (base from `WEBHOOK_RETRY_BASE_MS`, cap 60 s). Jitter stops many clients from retrying in lockstep;
`Retry-After` from the server wins when present.

**26 Webhooks.** Publishing an order event starts deliveries without awaiting them, so the API response never waits for
a receiver. Each delivery is signed with HMAC-SHA256 over `<timestamp>.<body>`, retried with backoff, and logged per
attempt. `verifyWebhookSignature` is the receiver-side helper: constant-time comparison via `timingSafeEqual` plus a
300-second timestamp window.

**27 Error handling.** One `ApiProblem` class carries slug, detail and optional field errors, and `sendProblem` renders
RFC 9457 JSON with `instance` and `requestId`. Express's error-handling middleware turns unknown exceptions into a generic
500 and logs the real error with the request id, so no stack trace or message leaks.
