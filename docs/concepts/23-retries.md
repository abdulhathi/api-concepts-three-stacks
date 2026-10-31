# 23 · Retries

A retry is the client sending the same request again after a failure that may be temporary.

## Why it matters

- Networks drop packets and servers return `503` during deploys. Without retries, every blip becomes an error for the user.
- Retrying the wrong request does harm: a retried `POST` can create two orders, and a retried `400` can never succeed.
- Retrying too eagerly turns a small outage into a bigger one, because every client hammers the struggling server.

## How it works

A good retry policy answers four questions. Which failures? Network errors, timeouts and the statuses 408, 429, 502, 503, 504, but not other 4xx or 5xx, which will fail again. Which requests? Only those safe to repeat: idempotent methods (RFC 9110) or a `POST` with an `Idempotency-Key` (concept 22). How many times? A small cap, here 3 retries. How long to wait? `Retry-After` if the server sent one, otherwise exponential backoff (concept 25).

```http
GET /v1/demo/flaky?key=demo&failTimes=2 HTTP/1.1

HTTP/1.1 503 Service Unavailable          <- attempt 1, the client waits and retries
HTTP/1.1 503 Service Unavailable          <- attempt 2, waits longer and retries
HTTP/1.1 200 OK                           <- attempt 3
{"key":"demo","attempts":3}
```

## The rule in this repo

- Retries live in each stack's typed client, not the server. Up to 3 retries (4 attempts).
- Retry on network errors, timeouts, 408, 429, 502, 503, 504. Never on other 4xx or 5xx.
- Retry only GET, HEAD, PUT, DELETE, OPTIONS, or a POST that carries an `Idempotency-Key`. `createOrder` makes one UUID key and reuses it on every attempt.
- When it gives up, the client throws a typed error that carries the problem details.

## Side by side

### Python · FastAPI
`BookshopClient.request` (httpx) loops over attempts. Here: the safe-method check and the give-up test.

```python
retryable_method = method in IDEMPOTENT_METHODS or bool(
    headers and "Idempotency-Key" in headers
)
        # …
        if (
            response.status_code not in RETRYABLE_STATUSES
            or not retryable_method
            or attempts > self._max_retries
        ):
```
[bookshop_client/client.py](../../python-fastapi-aws/bookshop_client/client.py#L113-L136)

### TypeScript · Express
A hand-written `fetch` client. The policy is its own small module, separate from the HTTP code.

```typescript
export const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

/** Repeating a request is only safe when it cannot do its work twice. */
export function isSafeToRetry(method: string, headers: Headers): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase()) || headers.has('Idempotency-Key');
}
```
[src/client/retry.ts](../../node-typescript-gcp/src/client/retry.ts#L3-L9)

### C# · ASP.NET Core
`Microsoft.Extensions.Http.Resilience` (Polly v8) adds a retry strategy to the typed `HttpClient`.

```csharp
    var failed = args.Outcome switch
    {
        { Exception: HttpRequestException or TimeoutRejectedException } => true,
        { Result: { } response } => RetryableStatuses.Contains((int)response.StatusCode),
        _ => false,
    };
    return failed && IsReplayable(args.Context.GetRequestMessage());
// …
private static bool IsReplayable(HttpRequestMessage? request) =>
    request is not null &&
    (SafeMethods.Contains(request.Method.Method) || request.Headers.Contains("Idempotency-Key"));
```
[src/ApiConcepts.Client/RetryPolicy.cs](../../dotnet-azure/src/ApiConcepts.Client/RetryPolicy.cs#L36-L48)

## Try it

```bash
# Any stack works; 8001 is Python. Three calls with one key: 503, 503, 200
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
KEY=demo-$RANDOM
for i in 1 2 3; do curl -s -w ' -> %{http_code}\n' "http://localhost:8001/v1/demo/flaky?key=$KEY&failTimes=2" -H "Authorization: Bearer $TOKEN"; done

# The typed client does this loop for you and prints each retry and its delay
cd python-fastapi-aws && .venv/bin/python -m examples.retry_demo   # Node: npm run example:retry
```

## In the cloud

- **AWS:** the AWS SDKs retry by default, Lambda retries failed asynchronous invokes, and SQS redelivers a message after its visibility timeout.
- **GCP:** Cloud Tasks and Pub/Sub both have retry policies for failed deliveries. Cloud Run itself does not retry your requests.
- **Azure:** Service Bus redelivers messages up to a delivery count, and the Azure SDKs retry by default. This repo's client uses Polly.

## Common mistakes

- **Retrying a non-idempotent POST with no key.** A lost response then creates a duplicate.
- **Retrying errors that cannot succeed.** A 400, 401 or 404 returns the same answer every time.
- **Retrying with no cap or no delay.** It creates a retry storm that keeps a recovering server down.

## Interview questions

<details><summary>Which failures should a client retry?</summary>
Temporary ones: network errors, timeouts, 408, 429, 502, 503 and 504. Not client mistakes (400, 401, 404, 422), because the same request fails the same way.
</details>
<details><summary>Why is retrying a POST dangerous, and how do you make it safe?</summary>
The first attempt may have worked and only the response was lost, so a retry could repeat the side effect. Send an `Idempotency-Key` so the server returns the first result instead of acting twice.
</details>
<details><summary>What is a retry storm?</summary>
Many clients retry at once against a server that is already struggling, and the extra load keeps it down. Use a small retry cap, exponential backoff with jitter, and respect `Retry-After`.
</details>

← [previous](22-idempotency.md) · [all concepts](../README.md) · [next](24-timeouts.md) →
