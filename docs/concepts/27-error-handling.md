# 27 · Error handling

Error handling is how an API reports failures: the right status code, a machine-readable body, and no internal details leaked.

## Why it matters

- A bare `500` or a plain-text message forces every client to guess what went wrong and whether to retry.
- Stack traces and exception messages help attackers and expose internals.
- If each layer (framework, gateway, handler) formats errors differently, clients need many parsers.

## How it works

RFC 9457 ("Problem Details for HTTP APIs", which replaces RFC 7807) defines one JSON error shape with media type `application/problem+json`. The standard members are `type` (a URI naming the kind of problem), `title`, `status`, `detail` and `instance`. APIs may add extension members. Clients branch on `status` and `type`, never on the text of `detail`.

```http
GET /v1/products?limit=0 HTTP/1.1

HTTP/1.1 400 Bad Request
Content-Type: application/problem+json
X-Request-Id: 3f0c9a52-6b1e-4d27-8c55-0a7e1d2b9f10

{"type":"/problems/validation-error","title":"Your request is not valid","status":400,
 "detail":"limit must be between 1 and 50","instance":"/v1/products",
 "requestId":"3f0c9a52-6b1e-4d27-8c55-0a7e1d2b9f10",
 "errors":[{"field":"limit","message":"must be between 1 and 50"}]}
```

## The rule in this repo

- Every error is `application/problem+json`, except `/oauth/token`, which follows RFC 6749.
- `type` is `/problems/<slug>`. `instance` is the path without the query string. `requestId` equals the `X-Request-Id` header. `errors` appears only for `validation-error`.
- Unknown routes, wrong methods and wrong content types use the same shape as errors raised in handlers.
- A 500 never leaks anything: `detail` is exactly `An unexpected error occurred.`, and the exception is logged with the request ID.
- The slugs and statuses (400 to 504) are listed in the table in `SPEC.md`.

## Side by side

### Python · FastAPI
Routes raise `Problem(slug, detail)`. Exception handlers for `Problem`, validation errors and Starlette's `HTTPException` render it; a `CrashGuard` middleware catches the rest.

```python
body: dict[str, Any] = {
    "type": f"/problems/{problem.slug}",
    "title": problem.title,
    "status": problem.status,
    "detail": problem.detail,
    "instance": request.url.path,
    "requestId": request_id,
}
```
[app/web/problems.py](../../python-fastapi-aws/app/web/problems.py#L61-L68)

### TypeScript · Express
Handlers throw `ApiProblem`. The final error middleware renders it, and logs anything unexpected before sending the fixed 500.

```typescript
// Log the real error with the request id; never put its message or stack in the response.
sink(
  JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    requestId: res.getHeader('X-Request-Id'),
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  }),
);
sendProblem(req, res, new ApiProblem('internal-error', 'An unexpected error occurred.'));
```
[src/http/errors.ts](../../node-typescript-gcp/src/http/errors.ts#L20-L30)

### C# · ASP.NET Core
Handlers throw `ProblemException`. An `IExceptionHandler` renders it, and `UseStatusCodePages` covers bare framework statuses such as 405 through [ProblemWriter](../../dotnet-azure/src/ApiConcepts.Api/Common/ProblemWriter.cs#L9).

```csharp
if (exception is ProblemException problem)
{
    await ProblemWriter.WriteAsync(context, problem.Type, problem.Detail, problem.Errors, problem.Headers);
    return true;
}

logger.LogError(exception, "Unhandled exception for request {RequestId}", context.TraceIdentifier);
await ProblemWriter.WriteAsync(context, ProblemType.InternalError, "An unexpected error occurred.");
return true;
```
[src/ApiConcepts.Api/Common/ApiExceptionHandler.cs](../../dotnet-azure/src/ApiConcepts.Api/Common/ApiExceptionHandler.cs#L10-L18)

## Try it

```bash
# Any stack works; 8001 is Python
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -si http://localhost:8001/nope | grep -i -E '^(HTTP|content-type)'                                # 404, problem+json
curl -s "http://localhost:8001/v1/products?limit=0" -H "Authorization: Bearer $TOKEN" | jq               # 400 with errors[]
curl -s http://localhost:8001/v1/demo/crash -H "Authorization: Bearer $TOKEN" | jq '{status, detail}'  # fixed 500 message
```

## In the cloud

- **AWS:** API Gateway can customize its own gateway responses (for example 4xx and 5xx it generates). The app's exceptions go to CloudWatch Logs.
- **GCP:** Cloud Error Reporting groups exceptions that Cloud Run logs. The app still shapes the response.
- **Azure:** Application Insights collects exceptions, and API Management has an `on-error` policy section to reshape errors.

## Common mistakes

- **Leaking internals.** Returning `str(exception)` or a stack trace tells attackers about your code and database.
- **Wrong class of status.** `200` with an error body, or `500` for a bad request, breaks retries and monitoring.
- **Clients parsing `detail`.** Messages change. Branch on `status` and `type`.

## Interview questions

<details><summary>Why use RFC 9457 problem details instead of a custom error format?</summary>
It is a standard, so clients, SDKs and gateways already understand it, and it has a place for machine-readable `type` and extensions. You do not have to design and document your own envelope.
</details>
<details><summary>When is an error a 4xx and when a 5xx?</summary>
4xx means the client can fix the request (bad input, no permission), so retrying unchanged will not help. 5xx means the server failed, and a retry may work. Alert on 5xx; 4xx is usually normal traffic.
</details>
<details><summary>Why include a request ID in the error body?</summary>
It lets support match a client's error to the server log line for that exact request, which holds the real exception that the client was not shown.
</details>

← [previous](26-webhooks.md) · [all concepts](../README.md)
