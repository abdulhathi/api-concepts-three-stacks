# 01 · Requests and responses

HTTP is a conversation in which a client sends one request and the server sends back one response.

## Why it matters

- Every other concept in this repo is a rule about what goes into a request or comes back in a response.
- If you cannot see the raw request and response, you cannot debug a bug that lives between client and server.
- A structured log line per request is how you answer "what happened to that call?" in production.

## How it works

A request has a method, a target, headers and an optional body. A response has a status code, headers and an optional body. The two are matched by the connection, not by an id, so the API adds its own `X-Request-Id` to tie them together (see [04 · Headers](04-headers.md)).

`POST /v1/echo` sends the request back to you, so you can see what the server received:

```http
POST /v1/echo?a=1 HTTP/1.1
Host: localhost:8001
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{"hi":1}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: 0b0c6f4e-6a52-4a49-b9a1-5d8a2f5f2d77
Cache-Control: no-store

{"method":"POST","path":"/v1/echo","query":{"a":"1"},"headers":{"authorization":"Bearer ***","content-type":"application/json"},"body":{"hi":1}}
```

The token is masked on the way back, so the echo never leaks a credential. The same call also writes one JSON line to stdout (fields are listed below).

## The rule in this repo

- `GET` and `POST /v1/echo` return `{ method, path, query, headers, body }`. `query` keeps the first value of each name. `headers` has lower-case names, with `authorization` replaced by `"Bearer ***"`. `body` is the parsed JSON or `null`.
- Every request writes one JSON log line: `ts`, `level`, `requestId`, `method`, `path`, `status`, `durationMs`, `clientId` (`null` when not authenticated). Tokens, secrets and bodies are never logged.

## Side by side

### Python · FastAPI
The handler takes the Starlette `Request` and builds the echo by hand. The log line comes from ASGI middleware in `app/web/middleware.py`.

```python
async def echo(request: Request, _: Annotated[Principal, Depends(require())]) -> dict[str, Any]:
    """Returns the method, path, first query values, headers (token masked) and parsed JSON body."""
    headers: dict[str, str] = {}
    for name, value in request.headers.items():
        headers[name] = f"{headers[name]}, {value}" if name in headers else value
    if "authorization" in headers:
        headers["authorization"] = "Bearer ***"
    return {
        "method": request.method,
        "path": request.url.path,
        "query": {name: request.query_params.getlist(name)[0] for name in request.query_params},
        "headers": headers,
        "body": await read_json(request, required=False) if request.method == "POST" else None,
    }
```
[`app/routes/echo.py` lines 17-30](../../python-fastapi-aws/app/routes/echo.py#L17-L30)

### TypeScript · Express
`router.all` handles both methods; the excerpt shows how query and headers are collected. The log line is written from `res.on('finish')` in `src/http/requestLog.ts`.

```ts
    const query = Object.fromEntries(
      Object.entries(req.query).map(([name, value]) => [name, String(Array.isArray(value) ? value[0] : value)]),
    );
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : String(value)]),
    );
    if (headers.authorization) headers.authorization = 'Bearer ***'; // never reflect credentials
    res.json({ method: req.method, path: req.originalUrl.split('?')[0], query, headers, body: req.json ?? null });
  });
```
[`src/demo/routes.ts` lines 56-64](../../node-typescript-gcp/src/demo/routes.ts#L56-L64)

### C# · ASP.NET Core
A Minimal API handler gets the `HttpRequest`. `RequestLogMiddleware` writes the log line in a `finally` block after the rest of the pipeline has run.

```csharp
    private static async Task<IResult> Echo(HttpRequest request)
    {
        var body = JsonBody.Parse(await JsonBody.ReadRawAsync(request));

        return Results.Ok(new
        {
            method = request.Method,
            path = request.Path.Value,
            query = request.Query.ToDictionary(q => q.Key, q => q.Value.FirstOrDefault()),
            headers = request.Headers.ToDictionary(h => h.Key.ToLowerInvariant(), h => Mask(h.Key, h.Value)),
            body,
        });
    }
```
[`src/ApiConcepts.Api/Endpoints/SystemEndpoints.cs` lines 39-51](../../dotnet-azure/src/ApiConcepts.Api/Endpoints/SystemEndpoints.cs#L39-L51)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s -X POST 'localhost:8001/v1/echo?a=1' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"hi":1}' | jq
curl -si localhost:8001/health          # -i shows the status line and response headers
```

## In the cloud

- **AWS:** API Gateway access logs (to CloudWatch Logs) record one line per request at the edge, before it reaches Lambda.
- **GCP:** Cloud Run writes a request log entry for every call to Cloud Logging, and it picks up JSON lines from stdout.
- **Azure:** Application Insights records each request as telemetry; the stdout JSON lines go to the App Service log stream.

## Common mistakes

- Logging the `Authorization` header or the request body. Logs are copied, searched and kept for months.
- Treating the response as the only thing worth reading. The request line and headers explain most "it works in curl" bugs.
- Logging the path with its query string when the query can hold secrets. This repo logs the path only.

## Interview questions

<details><summary>What are the parts of an HTTP request and response?</summary>A request has a method, target, headers and optional body. A response has a status code, headers and optional body. HTTP/1.1 is defined in RFC 9112, and the semantics in RFC 9110.</details>
<details><summary>Why add a request id to every response?</summary>It lets a client, a log search and a support ticket all point at the same call. The server echoes a well-formed id from the client, so one id can follow a request across services.</details>
<details><summary>Is HTTP stateless? What does that mean for the API?</summary>Each request carries everything the server needs, such as the bearer token, so any instance can answer it. State lives in storage, not in the connection.</details>

[all concepts](../README.md) · [next](02-endpoints.md) →
