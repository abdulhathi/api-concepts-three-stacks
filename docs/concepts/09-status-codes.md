# 09 · Status codes

A status code is the three-digit number at the top of a response that tells the client, in one number, how the request went.

## Why it matters

- Clients, proxies and monitoring tools decide what to do from the code alone, before they read any body.
- A `200` that contains an error message hides failures from retry logic, caches and dashboards.
- The class matters: a 4xx means "fix your request", a 5xx means "try again later, it is us".

## How it works

The first digit is the class (RFC 9110): 2xx success, 3xx redirection or "use your cache", 4xx client error, 5xx server error. The exact code narrows it down. Choose the most specific code that is true, and put the detail in the body.

```http
GET /v1/products/prd_01 HTTP/1.1
If-None-Match: "prd_01-v1"
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```http
HTTP/1.1 304 Not Modified
ETag: "prd_01-v1"
Cache-Control: private, max-age=60
```

No body: the client's copy is still good.

## The rule in this repo

| Code | Used for |
|---|---|
| 200, 201, 204 | read or change OK, created (with `Location`), deleted |
| 304 | `If-None-Match` matched; no body |
| 400 | invalid query, path or body; bad JSON; bad cursor; missing `Idempotency-Key` |
| 401 | missing, expired or badly signed token |
| 403 | token lacks the scope |
| 404 | unknown id, unknown route, or another client's order |
| 409 | state not allowed, or the same idempotency key still in flight |
| 412 | `If-Match` does not match the current ETag |
| 415 | wrong `Content-Type` |
| 422 | unknown product in an order, or an idempotency key reused with a different body |
| 429 | rate limit; has `Retry-After` |
| 500 | unhandled error (always a generic message) |
| 503, 504 | queue full or planned outage; report timed out |

Every error body also has a problem `type` slug. The full list is in [27 · Error handling](27-error-handling.md).

## Side by side

### Python · FastAPI
One catalog maps each problem slug to a status and title, so a status is never typed twice. Python and C# also define `405 method-not-allowed`, which the spec lists as optional; Python sends it, while TypeScript and C# answer a wrong method with 404.

```python
    "unauthorized": (401, "Authentication is required"),
    "forbidden": (403, "You are not allowed to do this"),
    "not-found": (404, "Resource not found"),
    "method-not-allowed": (405, "Method not allowed"),
    "invalid-state": (409, "The resource is in a state that does not allow this"),
    "idempotency-key-in-progress": (409, "A request with this Idempotency-Key is in progress"),
    "precondition-failed": (412, "The resource changed since you last saw it"),
    "unsupported-media-type": (415, "Unsupported media type"),
```
[`app/web/problems.py` lines 17-24](../../python-fastapi-aws/app/web/problems.py#L17-L24)

### TypeScript · Express
The same table as a typed record. A slug that is not in the union cannot compile.

```ts
  unauthorized: { status: 401, title: 'Authentication is required' },
  forbidden: { status: 403, title: 'You are not allowed to do this' },
  'not-found': { status: 404, title: 'Resource not found' },
  'invalid-state': { status: 409, title: 'The resource is in a state that does not allow this' },
  'idempotency-key-in-progress': { status: 409, title: 'A request with this Idempotency-Key is in progress' },
  'precondition-failed': { status: 412, title: 'The resource changed since you last saw it' },
  'unsupported-media-type': { status: 415, title: 'Unsupported media type' },
  'unknown-product': { status: 422, title: 'The order references an unknown product' },
  'idempotency-key-reused': { status: 422, title: 'This Idempotency-Key was used with a different request' },
  'rate-limited': { status: 429, title: 'Too many requests' },
```
[`src/http/problem.ts` lines 29-38](../../node-typescript-gcp/src/http/problem.ts#L29-L38)

### C# · ASP.NET Core
Each problem type is a static record holding slug, status and title.

```csharp
    public static readonly ProblemType Unauthorized = new("unauthorized", 401, "Authentication is required");
    public static readonly ProblemType Forbidden = new("forbidden", 403, "You are not allowed to do this");
    public static readonly ProblemType NotFound = new("not-found", 404, "Resource not found");
    public static readonly ProblemType MethodNotAllowed = new("method-not-allowed", 405, "Method not allowed");
    public static readonly ProblemType InvalidState = new("invalid-state", 409, "The resource is in a state that does not allow this");
    public static readonly ProblemType IdempotencyKeyInProgress = new("idempotency-key-in-progress", 409, "A request with this Idempotency-Key is in progress");
    public static readonly ProblemType PreconditionFailed = new("precondition-failed", 412, "The resource changed since you last saw it");
    public static readonly ProblemType UnsupportedMediaType = new("unsupported-media-type", 415, "Unsupported media type");
```
[`src/ApiConcepts.Api/Common/ProblemTypes.cs` lines 10-17](../../dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs#L10-L17)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8001/v1/products                                   # 401
curl -s -o /dev/null -w '%{http_code}\n' localhost:8001/v1/products -H "Authorization: Bearer $TOKEN" # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:8001/v1/products/nope -H "Authorization: Bearer $TOKEN"   # 404
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN"   # 403
```

## In the cloud

- **AWS:** API Gateway makes some codes itself: 429 when its own limits trip, and 502 or 504 for Lambda failures. HTTP APIs cut integrations off at 30 seconds.
- **GCP:** Cloud Run returns 429 when it is out of capacity, 503 when an instance cannot serve the request, and 504 at its request timeout (300 seconds by default).
- **Azure:** the App Service front end returns 502 or 503 when the app is down or restarting, and cuts off requests that sit idle for about 230 seconds.

## Common mistakes

- Returning `200` with `{"error": ...}`. Every client now has to look inside the body.
- Using `403` when `401` is right. 401 means "who are you?", 403 means "I know you, and no".
- Using `500` for bad input. A 500 should mean a bug on the server, and it pages someone.

## Interview questions

<details><summary>401 or 403?</summary>401 means the caller is not authenticated: no valid credentials. 403 means they are authenticated but not allowed. A 401 should carry a `WWW-Authenticate` header.</details>
<details><summary>When do you return 404 instead of 403?</summary>When revealing that something exists is itself a leak. This API returns 404 for another client's order so ids cannot be probed.</details>
<details><summary>What does 304 save?</summary>The body. The client sends a validator (`If-None-Match`), the server confirms nothing changed, and only headers travel. See [19 · Caching](19-caching.md).</details>

← [previous](08-api-schemas.md) · [all concepts](../README.md) · [next](10-authentication.md) →
