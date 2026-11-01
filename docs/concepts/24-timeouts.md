# 24 · Timeouts

A timeout is a deadline: if a call has not finished in time, the caller (or the server) gives up instead of waiting forever.

## Why it matters

- A client with no timeout can hang for minutes on a dead connection and tie up its own threads or connections.
- A server that never cancels slow work keeps holding memory, database connections and throttle slots for a result no one is waiting for.
- Retries (concept 23) only work if each attempt ends. A hung attempt blocks every retry after it.

## How it works

There are two sides. The client sets a deadline for each attempt, so a stuck connection counts as one failed attempt and can be retried. The server sets a deadline for expensive work and, when it passes, cancels the work and answers. A gateway in front may add its own limit, so the inner deadline should be shorter than the outer one.

`504 Gateway Timeout` (RFC 9110) normally comes from a proxy whose upstream was too slow. This contract also uses it for the API's own deadline.

```http
GET /v1/reports/sales?delayMs=5000 HTTP/1.1
Authorization: Bearer <token>

HTTP/1.1 504 Gateway Timeout
Content-Type: application/problem+json

{"type":"/problems/timeout","title":"The request took too long","status":504,
 "detail":"The report took longer than 2000 ms.", ...}
```

## The rule in this repo

- The server cancels a report that takes longer than `REQUEST_TIMEOUT_MS` (default 2000) and answers 504 `timeout` at that moment.
- The clock starts when the work starts. Time spent waiting in the throttle queue (concept 21) does not count.
- The typed client gives each attempt its own timeout (default 5 s). A timed-out attempt is retried like a network error.

## Side by side

### Python · FastAPI
`asyncio.wait_for` cancels the work on expiry, which frees the throttle slot. The client uses [asyncio.timeout](../../python-fastapi-aws/bookshop_client/client.py#L165) around each attempt.

```python
async def with_deadline() -> dict[str, Any]:
    # The deadline starts when the job gets a slot; time spent queued does not count.
    try:
        return await asyncio.wait_for(work(), timeout=self._timeout_s)
    except TimeoutError as exc:
        raise Problem(
            "timeout", f"The report took longer than {int(self._timeout_s * 1000)} ms."
        ) from exc
```
[app/services/reports.py](../../python-fastapi-aws/app/services/reports.py#L40-L47)

### TypeScript · Express
`AbortSignal.timeout` aborts the simulated work. The client uses the same API for each [fetch attempt](../../node-typescript-gcp/src/client/client.ts#L155).

```typescript
// The deadline starts when the work starts, and aborting it frees the slot straight away.
const deadline = AbortSignal.timeout(requestTimeoutMs);
await sleep(delayMs, deadline).catch(() => {
  throw new ApiProblem('timeout', `The report took longer than ${requestTimeoutMs} ms.`);
});
```
[src/reports/routes.ts](../../node-typescript-gcp/src/reports/routes.ts#L35-L39)

### C# · ASP.NET Core
The built-in request timeouts middleware swaps `RequestAborted` for a token that fires after the policy time. The client adds a Polly [timeout strategy](../../dotnet-azure/src/ApiConcepts.Client/RetryPolicy.cs#L31) per attempt.

```csharp
services.AddOptions<RequestTimeoutOptions>().Configure<AppSettings>((options, settings) =>
    options.AddPolicy(ReportEndpoints.TimeoutPolicy, new RequestTimeoutPolicy
    {
        Timeout = settings.RequestTimeout,
        TimeoutStatusCode = StatusCodes.Status504GatewayTimeout,
        WriteTimeoutResponse = context => ProblemWriter.WriteAsync(
            context,
            ProblemType.Timeout,
            $"The report took longer than {settings.RequestTimeout.TotalMilliseconds:0} ms."),
    }));
```
[src/ApiConcepts.Api/Composition/ServiceRegistration.cs](../../dotnet-azure/src/ApiConcepts.Api/Composition/ServiceRegistration.cs#L89-L98)

## Try it

```bash
# Any stack works; 8001 is Python
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s -w '\n%{http_code} after %{time_total}s\n' "http://localhost:8001/v1/reports/sales?delayMs=500" -H "Authorization: Bearer $TOKEN"   # 200
curl -s -w '\n%{http_code} after %{time_total}s\n' "http://localhost:8001/v1/reports/sales?delayMs=5000" -H "Authorization: Bearer $TOKEN"  # 504 at about 2 s
```

## In the cloud

- **AWS:** API Gateway HTTP APIs cut integrations off at 30 s, and the Lambda `Timeout` is 15 s in this repo's template. The app's 2 s deadline is shorter than both.
- **GCP:** Cloud Run has a request timeout, set to 30 s by `--timeout` in [deploy.sh](../../node-typescript-gcp/infra/gcp/deploy.sh#L65).
- **Azure:** App Service times out a request that has not started responding after about 230 seconds. Keep application deadlines far below that.

## Common mistakes

- **No client timeout.** Some HTTP clients never time out by default (Python's requests library), and others wait for minutes (.NET's HttpClient waits 100 seconds). Set your own.
- **Timing out without cancelling.** The response is sent, but the job keeps running and holding its slot.
- **A deadline longer than the layer in front.** The gateway answers first, and your 504 is never seen.

## Interview questions

<details><summary>What is the difference between a connect timeout and a read timeout?</summary>
A connect timeout limits how long to wait to open the connection. A read timeout limits the wait for data on an open connection. An overall deadline, as used here, limits the whole attempt.
</details>
<details><summary>Why should the server cancel work after a timeout?</summary>
Otherwise the result is thrown away but the cost is still paid, and under load the abandoned jobs pile up and use all capacity.
</details>
<details><summary>What is the difference between 408 and 504?</summary>
408 means the server gave up waiting for the client to finish sending the request. 504 means a gateway or proxy did not get a timely answer from the service behind it.
</details>

← [previous](23-retries.md) · [all concepts](../README.md) · [next](25-exponential-backoff.md) →
