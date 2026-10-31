# Concepts map

Where each of the 27 API concepts lives in this stack (C#, .NET 9, ASP.NET Core Minimal APIs), the tests that prove it, and a command to try it.

Start the server (`dotnet run --project src/ApiConcepts.Api`, port 8003), then set these tokens once:

```bash
tok() { curl -s -X POST localhost:8003/oauth/token -u "$1:$1-secret" -d grant_type=client_credentials | jq -r .access_token; }
TOKEN=$(tok reader); ADMIN=$(tok admin); FREE=$(tok free)
```

| # | Concept | Code | Tests | Try it |
|---|---|---|---|---|
| 1 | Requests and responses | [SystemEndpoints.cs](src/ApiConcepts.Api/Endpoints/SystemEndpoints.cs#L39)<br>[RequestLogMiddleware.cs](src/ApiConcepts.Api/Http/RequestLogMiddleware.cs#L17) | `Test_01_Echo_Returns_Request_And_Masks_Authorization`<br>`Test_01_Request_Log_Line_Is_Structured_And_Has_No_Secrets` | `curl -s -X POST "localhost:8003/v1/echo?a=1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"hi":1}'` |
| 2 | Endpoints | [PipelineSetup.cs](src/ApiConcepts.Api/Composition/PipelineSetup.cs#L33)<br>[SystemEndpoints.cs](src/ApiConcepts.Api/Endpoints/SystemEndpoints.cs#L11) | `Test_02_Root_Health_And_Unknown_Routes` | `curl -s localhost:8003/` |
| 3 | HTTP methods | [ProductEndpoints.cs](src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L11) | `Test_03_Methods_Create_Replace_Patch_Delete_A_Product` | `curl -si -X PATCH localhost:8003/v1/products/prd_01 -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d '{"priceCents":3000}'` |
| 4 | Headers | [RequestIdMiddleware.cs](src/ApiConcepts.Api/Http/RequestIdMiddleware.cs#L6)<br>[JsonBodyFilter.cs](src/ApiConcepts.Api/Http/JsonBodyFilter.cs#L7)<br>[SecurityHeadersMiddleware.cs](src/ApiConcepts.Api/Http/SecurityHeadersMiddleware.cs#L5) | `Test_04_Request_Id_Is_Echoed_Or_Generated_On_Every_Response`<br>`Test_04_Wrong_Content_Type_Is_415_And_Merge_Patch_Is_Accepted`<br>`Test_04_Security_Headers_Are_On_Every_Response` | `curl -si -H "X-Request-Id: demo-1" localhost:8003/health` |
| 5 | Path and query parameters | [PageRequest.cs](src/ApiConcepts.Api/Common/PageRequest.cs#L12)<br>[ProductEndpoints.cs](src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L76) | `Test_05_Path_And_Query_Parameters_Select_And_Filter` | `curl -s "localhost:8003/v1/products?tag=oauth&limit=1" -H "Authorization: Bearer $TOKEN"` |
| 6 | Request bodies | [ProductInput.cs](src/ApiConcepts.Api/Endpoints/ProductInput.cs#L17)<br>[JsonBody.cs](src/ApiConcepts.Api/Common/JsonBody.cs#L16) | `Test_06_Body_Validation_Reports_Every_Bad_Field`<br>`Test_06_Body_Is_Trimmed_Unknown_Properties_Ignored_And_Bad_Json_Is_400` | `curl -s -X POST localhost:8003/v1/products -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d '{"title":"","priceCents":-1}'` |
| 7 | JSON and serialization | [UtcTimestampConverter.cs](src/ApiConcepts.Api/Common/UtcTimestampConverter.cs#L8)<br>[ServiceRegistration.cs](src/ApiConcepts.Api/Composition/ServiceRegistration.cs#L35) | `Test_07_Json_Is_CamelCase_With_Integer_Cents_And_Millisecond_Utc_Timestamps` | `curl -s localhost:8003/v1/products/prd_01 -H "Authorization: Bearer $TOKEN"` |
| 8 | API schemas | [ServiceRegistration.cs](src/ApiConcepts.Api/Composition/ServiceRegistration.cs#L103)<br>[PipelineSetup.cs](src/ApiConcepts.Api/Composition/PipelineSetup.cs#L45)<br>[OpenApiBody.cs](src/ApiConcepts.Api/Endpoints/OpenApiBody.cs#L12) | `Test_08_OpenApi_Document_And_Docs_Ui_Are_Served` | `curl -s localhost:8003/openapi.json \| head -c 300   # docs UI: http://localhost:8003/docs/` |
| 9 | Status codes | [ProblemTypes.cs](src/ApiConcepts.Api/Common/ProblemTypes.cs#L4) | `Test_09_Status_Codes_Cover_The_Contract` | `curl -si localhost:8003/v1/products/nope -H "Authorization: Bearer $TOKEN" \| head -1` |
| 10 | Authentication | [AuthSetup.cs](src/ApiConcepts.Api/Auth/AuthSetup.cs#L59) | `Test_10_Missing_Token_Is_401_With_Bearer_Challenge`<br>`Test_10_Bad_Token_Is_401_With_Invalid_Token_Error` | `curl -si localhost:8003/v1/me` |
| 11 | Authorization | [AuthSetup.cs](src/ApiConcepts.Api/Auth/AuthSetup.cs#L32)<br>[AuthSetup.cs](src/ApiConcepts.Api/Auth/AuthSetup.cs#L76)<br>[OrderEndpoints.cs](src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs#L137) | `Test_11_Missing_Scope_Is_403_And_Names_The_Needed_Scope`<br>`Test_11_Another_Clients_Order_Is_404_Unless_Admin` | `curl -si -X POST localhost:8003/v1/products -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'` |
| 12 | Access tokens and JWT | [TokenService.cs](src/ApiConcepts.Api/Auth/TokenService.cs#L17)<br>[AuthSetup.cs](src/ApiConcepts.Api/Auth/AuthSetup.cs#L41) | `Test_12_Jwt_Has_The_Contracted_Header_And_Claims`<br>`Test_12_Expired_Tampered_And_Foreign_Algorithm_Tokens_Are_Rejected` | `jq -R 'split(".")[1] \| @base64d \| fromjson' <<< "$TOKEN"` |
| 13 | OAuth 2.0 | [OAuthEndpoints.cs](src/ApiConcepts.Api/Auth/OAuthEndpoints.cs#L29)<br>[DemoClients.cs](src/ApiConcepts.Api/Auth/DemoClients.cs#L22) | `Test_13_Client_Credentials_Work_With_Basic_Or_Form_And_Narrow_Scope`<br>`Test_13_Token_Endpoint_Errors_Follow_Rfc_6749` | `curl -s -X POST localhost:8003/oauth/token -u reader:reader-secret -d grant_type=client_credentials -d scope=products:read` |
| 14 | HTTPS | [SecurityHeadersMiddleware.cs](src/ApiConcepts.Api/Http/SecurityHeadersMiddleware.cs#L14) | `Test_14_Hsts_Is_Sent_Only_When_The_Request_Arrived_Over_Https` | `curl -si localhost:8003/health -H "X-Forwarded-Proto: https" \| grep -i strict` |
| 15 | CORS | [ServiceRegistration.cs](src/ApiConcepts.Api/Composition/ServiceRegistration.cs#L70)<br>[VaryOriginMiddleware.cs](src/ApiConcepts.Api/Http/VaryOriginMiddleware.cs#L5) | `Test_15_Cors_Preflight_From_An_Allowed_Origin_Is_Answered_Without_Auth`<br>`Test_15_Cors_Actual_Request_Exposes_Headers_And_Other_Origins_Get_Nothing` | `curl -si -X OPTIONS localhost:8003/v1/products -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST"` |
| 16 | REST | [ProductEndpoints.cs](src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L85)<br>[ProductEndpoints.cs](src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L65) | `Test_16_Created_Resource_Is_Reachable_Through_Location`<br>`Test_16_Link_Header_Points_At_The_Next_Page` | `curl -si -X POST localhost:8003/v1/products -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d '{"title":"T","author":"A","priceCents":1}' \| grep -i "^location"` |
| 17 | GraphQL | [Query.cs](src/ApiConcepts.Api/GraphQl/Query.cs#L12)<br>[GraphQlTypes.cs](src/ApiConcepts.Api/GraphQl/GraphQlTypes.cs#L34)<br>[ServiceRegistration.cs](src/ApiConcepts.Api/Composition/ServiceRegistration.cs#L128) | `Test_17_GraphQL_Nested_Order_To_Product_Query_With_Plain_Ids`<br>`Test_17_GraphQL_Products_Connection_Pages_With_End_Cursor`<br>`Test_17_GraphQL_Order_Without_Scope_Is_FORBIDDEN_And_Bad_First_Is_BAD_USER_INPUT`<br>`Test_17_GraphQL_Needs_A_Token_With_Products_Read`<br>`Test_17_GraphQL_Hides_Another_Clients_Order` | `curl -s localhost:8003/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" -d '{"query":"{ products(first:2) { nodes { id title } } }"}'` |
| 18 | Pagination | [Cursor.cs](src/ApiConcepts.Api/Common/Cursor.cs#L44)<br>[PageRequest.cs](src/ApiConcepts.Api/Common/PageRequest.cs#L26) | `Test_18_Cursor_Pagination_Walks_All_25_Seeds_In_Order`<br>`Test_18_Bad_Cursor_And_Bad_Limit_Are_400_Problems` | `curl -si "localhost:8003/v1/products?limit=2" -H "Authorization: Bearer $TOKEN" \| grep -iE "^link\|nextCursor"` |
| 19 | Caching | [ETags.cs](src/ApiConcepts.Api/Common/ETags.cs#L7)<br>[ProductEndpoints.cs](src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L44) | `Test_19_Etag_And_If_None_Match_Give_304_With_No_Body`<br>`Test_19_List_Has_A_Weak_Etag_And_Revalidates`<br>`Test_19_If_Match_Mismatch_Is_412_And_A_Match_Bumps_The_Version` | `curl -si localhost:8003/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" -H 'If-None-Match: "prd_01-v1"' \| head -1` |
| 20 | Rate limiting | [ClientRateLimiter.cs](src/ApiConcepts.Api/RateLimiting/ClientRateLimiter.cs#L11)<br>[RateLimitSetup.cs](src/ApiConcepts.Api/RateLimiting/RateLimitSetup.cs#L19) | `Test_20_Rate_Limit_Returns_429_With_Retry_After_When_The_Bucket_Is_Empty`<br>`Test_20_Rate_Limit_Is_Per_Client_And_Skips_Health_Unauthenticated_And_Preflight` | `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " localhost:8003/v1/products -H "Authorization: Bearer $FREE"; done` |
| 21 | Throttling | [RateLimitSetup.cs](src/ApiConcepts.Api/RateLimiting/RateLimitSetup.cs#L20)<br>[ReportEndpoints.cs](src/ApiConcepts.Api/Endpoints/ReportEndpoints.cs#L15) | `Test_21_Throttle_Runs_Two_Queues_Two_And_Rejects_The_Fifth_And_Sixth_With_503`<br>`Test_21_Reports_Are_Admitted_Again_Once_The_Queue_Drains` | `for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " "localhost:8003/v1/reports/sales?delayMs=1500" -H "Authorization: Bearer $TOKEN" & done; wait` |
| 22 | Idempotency | [IdempotencyStore.cs](src/ApiConcepts.Api/Orders/IdempotencyStore.cs#L29)<br>[OrderEndpoints.cs](src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs#L40) | `Test_22_Idempotency_Replays_The_Stored_201_Without_Creating_Another_Order`<br>`Test_22_Reusing_A_Key_With_A_Different_Body_Is_422`<br>`Test_22_Missing_Or_Oversized_Key_Is_400_And_Keys_Are_Scoped_Per_Client`<br>`Test_22_A_Failed_First_Attempt_Does_Not_Poison_The_Key`<br>`Test_22_Same_Key_While_The_First_Is_In_Flight_Is_409`<br>`Test_22_Pay_Is_Idempotent_Too_Paying_Twice_Leaves_The_Order_Unchanged` | `for i in 1 2; do curl -si -X POST localhost:8003/v1/orders -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -H "Idempotency-Key: demo-key-1" -d '{"items":[{"productId":"prd_01","quantity":1}]}' \| grep -iE "^HTTP\|idempotent"; done` |
| 23 | Retries | [RetryPolicy.cs](src/ApiConcepts.Client/RetryPolicy.cs#L34)<br>[ApiClient.cs](src/ApiConcepts.Client/ApiClient.cs#L46) | `Test_23_Client_Retries_503_Until_It_Succeeds_And_Caches_The_Token`<br>`Test_23_Client_Gives_Up_After_Four_Attempts_With_The_Problem_Details`<br>`Test_23_Client_Does_Not_Retry_Other_Statuses`<br>`Test_23_A_Post_Without_An_Idempotency_Key_Is_Never_Retried`<br>`Test_23_Create_Order_Reuses_One_Idempotency_Key_On_Every_Attempt`<br>`Test_23_Client_Works_End_To_End_Against_The_Server_Including_Flaky_Retries`<br>`Test_23_Retry_After_Overrides_The_Backoff_Delay` | `dotnet run --project examples/RetryDemo` |
| 24 | Timeouts | [ServiceRegistration.cs](src/ApiConcepts.Api/Composition/ServiceRegistration.cs#L86)<br>[ReportEndpoints.cs](src/ApiConcepts.Api/Endpoints/ReportEndpoints.cs#L23)<br>[RetryPolicy.cs](src/ApiConcepts.Client/RetryPolicy.cs#L31) | `Test_24_Client_Times_Out_Each_Attempt_Then_Retries_And_Finally_Gives_Up`<br>`Test_24_Server_Cancels_A_Slow_Report_And_Answers_504_At_The_Timeout`<br>`Test_24_A_Fast_Report_Finishes_Inside_The_Timeout` | `curl -si "localhost:8003/v1/reports/sales?delayMs=5000" -H "Authorization: Bearer $TOKEN" \| head -1` |
| 25 | Exponential backoff | [Backoff.cs](src/ApiConcepts.Api/Webhooks/Backoff.cs#L5)<br>[RetryPolicy.cs](src/ApiConcepts.Client/RetryPolicy.cs#L51)<br>[WebhookWorker.cs](src/ApiConcepts.Api/Webhooks/WebhookWorker.cs#L45) | `Test_25_Client_Backoff_Doubles_With_Jitter_Up_To_The_Cap`<br>`Test_25_Webhook_Backoff_Formula_Is_Jittered_Capped_Exponential` | `dotnet run --project examples/RetryDemo` |
| 26 | Webhooks | [WebhookService.cs](src/ApiConcepts.Api/Webhooks/WebhookService.cs#L13)<br>[WebhookWorker.cs](src/ApiConcepts.Api/Webhooks/WebhookWorker.cs#L8)<br>[WebhookSignature.cs](src/ApiConcepts.Api/Webhooks/WebhookSignature.cs#L7)<br>[WebhookSignature.cs](src/ApiConcepts.Client/WebhookSignature.cs#L15) | `Test_26_Subscription_Has_Whsec_Secret_Which_The_List_Hides`<br>`Test_26_Webhook_Delivery_Is_Signed_And_Verifiable_By_The_Receiver_Helper`<br>`Test_26_Failed_Delivery_Is_Retried_With_Backoff_Until_The_Receiver_Recovers`<br>`Test_26_Delivery_Fails_After_The_Maximum_Attempts_And_The_Log_Says_Why`<br>`Test_26_Only_Matching_Events_Are_Delivered_Replays_Send_Nothing_And_Fresh_Logs_Have_Nulls`<br>`Test_26_Unknown_Subscription_And_Non_Admin_Are_Refused` | `curl -s -X POST localhost:8003/v1/webhooks -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d '{"url":"https://example.com/hook","events":["order.paid"]}'` |
| 27 | Error handling | [ProblemWriter.cs](src/ApiConcepts.Api/Common/ProblemWriter.cs#L9)<br>[ApiExceptionHandler.cs](src/ApiConcepts.Api/Common/ApiExceptionHandler.cs#L6)<br>[ProblemException.cs](src/ApiConcepts.Api/Common/ProblemException.cs#L4) | `Test_27_Every_Error_Is_Problem_Json_With_Request_Id_And_Instance_Without_Query`<br>`Test_27_Unhandled_Exception_Is_A_Safe_500_Without_Leaking_Details`<br>`Test_27_Flaky_Endpoint_Fails_On_Purpose_Then_Recovers_And_Counts_Per_Key`<br>`Test_27_Sales_Report_Sums_Only_Paid_Orders` | `curl -si localhost:8003/v1/demo/crash -H "Authorization: Bearer $TOKEN"` |

## 1. Requests and responses

The echo endpoint returns exactly what the server received, with the Authorization header masked. A small middleware writes one JSON log line per request (method, path, status, duration, client id) to stdout, through an `IRequestLogSink` so tests can capture it. It never logs tokens or bodies.

## 2. Endpoints

Minimal API route groups: `/v1` is one `MapGroup`, and each resource lives in its own static class with a `Map...` extension (`MapProducts`, `MapOrders`, ...). Program.cs and `PipelineSetup` read as a table of contents. Unknown routes hit `MapFallback`, which throws a `not-found` problem.

## 3. HTTP methods

Products use `MapGet`, `MapPost`, `MapPut`, `MapPatch` and `MapDelete` on one group. PUT requires every field and replaces the product; PATCH accepts any subset (also as `application/merge-patch+json`); both bump `version`.

## 4. Headers

Three small pieces of middleware: one echoes or generates `X-Request-Id`, one adds `X-Content-Type-Options` and `Referrer-Policy`, and an endpoint filter on the `/v1` group rejects bodies that are not JSON with 415. Headers are written in `Response.OnStarting` callbacks so they survive the exception handler, which clears headers before it writes an error.

## 5. Path and query parameters

Path parameters bind from the route template (`/{id}`); query parameters are read and validated in `PageRequest.From` so a bad `limit` becomes a field-level `validation-error` instead of a framework 400.

## 6. Request bodies

Handlers read the raw bytes, parse them with `System.Text.Json`, and validate into typed fields while collecting every error, so one response lists all bad fields. Invalid JSON is a `malformed-json` problem; unknown properties are ignored; strings are trimmed.

## 7. JSON and serialization

ASP.NET Core defaults to camelCase; `ConfigureHttpJsonOptions` adds a `JsonConverter<DateTimeOffset>` that always writes `yyyy-MM-ddTHH:mm:ss.fffZ`. Money is `int` cents, and nullable fields are written as `null` rather than omitted (the default for System.Text.Json).

## 8. API schemas

`Microsoft.AspNetCore.OpenApi` generates the document from the endpoints and is mapped at `/openapi.json`; `Scalar.AspNetCore` serves the UI at `/docs` (it redirects to `/docs/`). Request bodies are added to the document with a small `WithBody<T>()` helper, because `Accepts<T>()` would also change routing.

## 9. Status codes

Every non-2xx status is one entry in `ProblemType` (slug, status, title), so the list of statuses the API can return is in one file. Success statuses are explicit: `Results.Json(..., statusCode: 201)`, `NoContent()` and `StatusCode(304)`.

## 10. Authentication

`AddJwtBearer` validates the token. Its `OnChallenge` event is overridden to write a `problem+json` 401 with `WWW-Authenticate: Bearer realm="api-concepts"`, adding `error="invalid_token"` when a token was sent but rejected. The whole `/v1` group calls `RequireAuthorization()`.

## 11. Authorization

One authorization policy per scope, applied per endpoint with `RequireAuthorization("products:write")`. A custom `IAuthorizationMiddlewareResultHandler` turns a failure into a 403 problem whose `WWW-Authenticate` names the missing scope. Ownership is checked in code: someone else's order answers 404, not 403.

## 12. Access tokens and JWT

`JsonWebTokenHandler` signs HS256 tokens carrying `iss aud sub scope iat exp jti`. Validation is pinned to HS256 only, checks issuer and audience, and sets `ClockSkew` to zero so expiry has no leeway. `MapInboundClaims = false` keeps claim names as written.

## 13. OAuth 2.0

A single Minimal API endpoint implements the client credentials grant, accepting `client_secret_basic` or `client_secret_post`, and answering RFC 6749 errors (`invalid_client`, `invalid_scope`, ...) as plain JSON rather than problem+json. Secrets are compared in constant time.

## 14. HTTPS

TLS terminates at the App Service front end (`httpsOnly: true` in the Bicep), which forwards plain HTTP plus `X-Forwarded-Proto`. The middleware adds HSTS only when the connection was TLS or that header says https, and never over plain HTTP.

## 15. CORS

The built-in CORS middleware runs before authentication and rate limiting, so preflights are answered without a token. The policy lists origins, methods, request headers, exposed headers and `SetPreflightMaxAge(10 minutes)`, and never allows credentials. A one-line middleware adds `Vary: Origin`, which the built-in one omits for explicit origin lists.

## 16. REST

Nouns in the URL, verbs in the method, the same shapes for every resource. Creation answers 201 with a `Location` header, and list responses carry a `Link: <...>; rel="next"` header so clients can follow links instead of building URLs.

## 17. GraphQL

HotChocolate builds the schema from plain C# classes. Ids use the `ID` scalar over the raw string (no Relay global ids), `order` checks `orders:read` itself and raises a `FORBIDDEN` error, and `OrderItem.product` is the nested resolver. `/graphql` is an ordinary endpoint, so the same JWT and rate-limit middleware apply.

## 18. Pagination

Keyset pagination: the cursor is the base64url of `(createdAt, id)` of the last item, so pages stay stable when data is added. It is opaque to clients; a cursor that does not decode is an `invalid-cursor` problem. One `Paging.Take` is shared by products and orders.

## 19. Caching

Single products get a strong `ETag` built from id and version; lists get a weak ETag hashed from the serialized body (`RawJsonResult` guarantees the hashed bytes are the bytes sent). `If-None-Match` yields 304 and `If-Match` on write endpoints yields `precondition-failed`. A middleware makes `no-store` the default for API paths.

## 20. Rate limiting

The built-in `TokenBucketRateLimiter` is partitioned by client id and sized from the client's plan. It cannot report "remaining", so `ClientRateLimiter` decorates the partitioned limiter and records a snapshot that a `OnStarting` callback turns into `RateLimit-*` headers. The `OnRejected` callback writes the 429 problem with `Retry-After`.

## 21. Throttling

A named `ConcurrencyLimiter` policy (`PermitLimit = 2`, `QueueLimit = 2`, oldest first) is attached to the report endpoint with `RequireRateLimiting`. The fifth concurrent request is rejected immediately and `OnRejected` answers 503 `throttled` with `Retry-After: 1`.

## 22. Idempotency

The store keeps the first 201 per (client, key) for 24 hours with a SHA-256 of the raw body. `Begin` decides atomically between proceed, replay, in-progress (409) and reused (422); a failed first attempt is abandoned so the key stays usable. The replayed response is the stored bytes, so it is byte-identical.

## 23. Retries

`Microsoft.Extensions.Http.Resilience` (Polly v8) wraps the typed `HttpClient` in a retry strategy. `ShouldHandle` retries network errors, timeouts and 408/429/502/503/504, but only for idempotent methods or a POST with an `Idempotency-Key`. `CreateOrderAsync` generates one key per call, so every retry reuses it.

## 24. Timeouts

Server: the RequestTimeouts middleware has a `report` policy of `REQUEST_TIMEOUT_MS`; the handler awaits `Task.Delay` on `HttpContext.RequestAborted`, which the middleware swaps for the timeout token, so the work really stops and a 504 problem is written. Client: a Polly timeout strategy inside the retry gives each attempt its own deadline.

## 25. Exponential backoff

Both the client and the webhook worker use `random(0.5, 1.0) x min(cap, base x 2^(n-1))`, so simultaneous failures spread out instead of retrying in lockstep. The client's `DelayGenerator` prefers a `Retry-After` header when the server sent one. Base and cap are options, so tests run in milliseconds.

## 26. Webhooks

Publishing writes a delivery record and enqueues a job on a `Channel<T>`; a `BackgroundService` delivers each job on its own task, so the API response never waits for a receiver. Each attempt is signed with HMAC-SHA256 over `timestamp.body`; the client library ships the constant-time `Verify` helper receivers use.

## 27. Error handling

Expected failures are thrown as `ProblemException`; an `IExceptionHandler` renders them as RFC 9457 `application/problem+json` with `requestId`. Anything else becomes a 500 whose detail is the fixed text "An unexpected error occurred.", while the real exception is logged with the request id. `UseStatusCodePages` covers bare framework statuses such as 405.
