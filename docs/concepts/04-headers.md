# 04 · Headers

Headers are name and value pairs sent with every request and response that carry metadata about the message, not the data itself.

## Why it matters

- Authentication, content type, caching and tracing all travel in headers. The body alone is not enough to make a call.
- A wrong `Content-Type` makes a server guess how to read the body, and guessing is how parsers get abused.
- Without a request id header, one failed call in a busy log is nearly impossible to find.

## How it works

Header names are case-insensitive (RFC 9110). Some describe the body (`Content-Type`), some control behavior (`Authorization`, `If-Match`), and some are added by the server to help the client (`Location`, `ETag`, `X-Request-Id`).

```http
GET /health HTTP/1.1
Host: localhost:8001
X-Request-Id: my-trace-1
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: my-trace-1
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer

{"status":"ok"}
```

The server echoed the id because it matched the safe pattern. Had the id been missing or contained odd characters, the server would have generated a UUID instead.

## The rule in this repo

- **Request id:** every response, including errors, 304s and unknown routes, carries `X-Request-Id`. A client value is echoed if it matches `^[A-Za-z0-9._-]{1,128}$`. Otherwise a UUID v4 is generated.
- **Security headers:** every response has `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. HSTS is covered in [14 · HTTPS](14-https.md).
- **Content-Type:** `POST`, `PUT` and `PATCH` bodies under `/v1` must be `application/json` (a charset is fine). `PATCH` also accepts `application/merge-patch+json`. Anything else is `415 unsupported-media-type`.
- **Location:** `201` responses point at the new resource.

## Side by side

### Python · FastAPI
Pure ASGI middleware wraps the `send` callable, so it can add headers to every response, even ones other layers produce.

```python
        async def send_with_context(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                out = MutableHeaders(scope=message)
                out["X-Request-Id"] = state["request_id"]
                out["X-Content-Type-Options"] = "nosniff"
                out["Referrer-Policy"] = "no-referrer"
                if https:
                    out["Strict-Transport-Security"] = _HSTS
                for name, value in state.get("rate_limit_headers", {}).items():
                    out[name] = value
                if "cache-control" not in out and _wants_no_store(path):
                    out["Cache-Control"] = "no-store"
            await send(message)
```
[`app/web/middleware.py` lines 66-80](../../python-fastapi-aws/app/web/middleware.py#L66-L80)

### TypeScript · Express
A small middleware sets the id before any other code runs. Security headers are in `src/http/securityHeaders.ts` and the 415 check is in `src/http/body.ts`.

```ts
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('X-Request-Id');
  res.setHeader('X-Request-Id', incoming && SAFE_ID.test(incoming) ? incoming : randomUUID());
  next();
};
```
[`src/http/requestContext.ts` lines 19-25](../../node-typescript-gcp/src/http/requestContext.ts#L19-L25)

### C# · ASP.NET Core
`OnStarting` sets the header just before the response begins, which also survives the exception handler clearing headers.

```csharp
    public Task InvokeAsync(HttpContext context)
    {
        var incoming = context.Request.Headers[HeaderName].ToString();
        var id = Valid().IsMatch(incoming) ? incoming : Guid.NewGuid().ToString();
        context.TraceIdentifier = id;

        // OnStarting rather than a plain assignment: the exception handler clears headers before it writes.
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = id;
            return Task.CompletedTask;
        });
        return next(context);
    }
```
[`src/ApiConcepts.Api/Http/RequestIdMiddleware.cs` lines 13-26](../../dotnet-azure/src/ApiConcepts.Api/Http/RequestIdMiddleware.cs#L13-L26)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
curl -si localhost:8001/health -H 'X-Request-Id: my-trace-1' | head -12
curl -si localhost:8001/health -H 'X-Request-Id: bad id!' | grep -i x-request-id   # replaced by a UUID
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -si -X POST localhost:8001/v1/echo -H "Authorization: Bearer $TOKEN" -H 'Content-Type: text/plain' -d 'hi'   # 415
```

## In the cloud

- **AWS:** API Gateway adds its own `x-amzn-RequestId` response header and can log request headers. The app's `X-Request-Id` still passes through.
- **GCP:** Cloud Run adds `X-Cloud-Trace-Context` to requests, which you can log next to your own id.
- **Azure:** the App Service front end adds `X-Forwarded-*` headers. Application Insights tracks its own operation id.

## Common mistakes

- Trusting a client-supplied request id without checking its shape. It ends up in logs and responses, so it must be safe.
- Reading `Content-Type` with an exact string match and rejecting `application/json; charset=utf-8`.
- Forgetting that custom response headers are hidden from browser code unless CORS exposes them (see [15 · CORS](15-cors.md)).

## Interview questions

<details><summary>Are HTTP header names case-sensitive?</summary>No. `ETag`, `etag` and `ETAG` are the same header. HTTP/2 and HTTP/3 send them lower-case on the wire.</details>
<details><summary>What is the difference between Accept and Content-Type?</summary>`Content-Type` says what format the body I am sending is in. `Accept` says what formats I am willing to receive back.</details>
<details><summary>Why did the old "X-" prefix convention go away?</summary>RFC 6648 deprecated it because custom headers that became standard had to be renamed. This repo keeps `X-Request-Id` because it is widely used, but new headers do not need the prefix.</details>

← [previous](03-http-methods.md) · [all concepts](../README.md) · [next](05-path-and-query-parameters.md) →
