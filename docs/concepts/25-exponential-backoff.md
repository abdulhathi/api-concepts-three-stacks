# 25 · Exponential backoff

Exponential backoff means each retry waits longer than the one before, usually doubling the delay up to a cap, with some randomness (jitter) added.

## Why it matters

- Retrying at once, or at a fixed pace, hits a struggling server again before it can recover.
- Without jitter, many clients that failed together retry together and arrive in waves ("thundering herd").
- Without a cap, the delay grows until the client appears to hang.

## How it works

The delay before retry `n` is `random(0.5, 1.0) x min(cap, base x 2^(n-1))`. The exponential part grows quickly, the cap stops it, and the random factor spreads clients out. This is the "equal jitter" variant: never zero, never above the ceiling. If the server sends `Retry-After` (RFC 9110), that value wins over the computed one.

| Retry | Ceiling (base 200 ms, cap 5 s) | Actual delay |
|---|---|---|
| 1 | 200 ms | 100 to 200 ms |
| 2 | 400 ms | 200 to 400 ms |
| 3 | 800 ms | 400 to 800 ms |

## The rule in this repo

- Client: base 200 ms, cap 5000 ms, both options so tests run fast. `Retry-After` seconds win when present.
- Webhook retries use the same formula with base `WEBHOOK_RETRY_BASE_MS` (default 500) and a 60 s cap, up to `WEBHOOK_MAX_ATTEMPTS` (default 5) attempts in total.
- Jitter source and sleep function are injectable, so tests check exact delays without waiting.

## Side by side

### Python · FastAPI
A pure function, plus the line in the client loop that lets `Retry-After` override it.

```python
def backoff_ms(retry: int, base_ms: float, cap_ms: float, jitter: Callable[[], float]) -> float:
    """random(0.5, 1.0) x min(cap, base x 2^(retry-1)): exponential growth with jitter."""
    return float((0.5 + 0.5 * jitter()) * min(cap_ms, base_ms * 2 ** (retry - 1)))
            # …
            delay_ms = (
                retry_after * 1000
                if retry_after is not None
                else backoff_ms(attempts, self._base_ms, self._cap_ms, self._jitter)
            )
```
[bookshop_client/client.py](../../python-fastapi-aws/bookshop_client/client.py#L30-L151)

### TypeScript · Express
The same formula, and a parser for `Retry-After` that accepts seconds or an HTTP date.

```typescript
/** random(0.5, 1.0) x min(cap, base x 2^(retry-1)): the "equal jitter" variant, never zero, never a stampede. */
export function backoffDelay(retry: number, baseMs: number, capMs: number, random: () => number = Math.random): number {
  return (0.5 + random() * 0.5) * Math.min(capMs, baseMs * 2 ** (retry - 1));
}
// …
export function retryAfterMs(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
```
[src/client/retry.ts](../../node-typescript-gcp/src/client/retry.ts#L11-L20)

### C# · ASP.NET Core
The Polly `DelayGenerator` calls `DelayFor`: `Retry-After` first, then exponential with jitter. The webhook worker uses a similar [Backoff.Delay](../../dotnet-azure/src/ApiConcepts.Api/Webhooks/Backoff.cs#L7).

```csharp
internal static TimeSpan DelayFor(int retryNumber, HttpResponseMessage? response, ApiClientOptions options)
{
    var retryAfter = response?.Headers.RetryAfter;
    if (retryAfter?.Delta is { } delta)
    {
        return delta;
    }
    // …
    var exponential = TimeSpan.FromTicks((long)Math.Min(options.BackoffCap.Ticks, options.BackoffBase.Ticks * Math.Pow(2, retryNumber - 1)));
    return exponential * (0.5 + 0.5 * Random.Shared.NextDouble());
```
[src/ApiConcepts.Client/RetryPolicy.cs](../../dotnet-azure/src/ApiConcepts.Client/RetryPolicy.cs#L51-L65)

## Try it

```bash
# Any stack works. The demo retries /v1/demo/flaky?failTimes=2 and prints each delay.
# Run it twice: the delays differ every time because of the jitter.
cd python-fastapi-aws && .venv/bin/python -m examples.retry_demo
cd node-typescript-gcp && npm run example:retry
cd dotnet-azure && dotnet run --project examples/RetryDemo
```

## In the cloud

- **AWS:** AWS SDK "standard" and "adaptive" retry modes use exponential backoff with jitter.
- **GCP:** Cloud Tasks queues have `minBackoff`, `maxBackoff` and `maxDoublings`, and Pub/Sub subscriptions have an exponential backoff retry policy.
- **Azure:** Azure SDK clients support an exponential retry mode (`RetryOptions`). This repo uses Polly.

## Common mistakes

- **No jitter.** Clients that failed together retry together.
- **No cap, or no attempt limit.** Waits grow without bound or retries never stop.
- **Ignoring `Retry-After`.** The server knows better than a formula when it will be ready.

## Interview questions

<details><summary>Why add jitter to exponential backoff?</summary>
So clients that failed at the same moment do not retry at the same moments. Randomness spreads the load instead of sending a new spike at every step.
</details>
<details><summary>What is the difference between "full jitter" and the formula used here?</summary>
Full jitter picks a random value between 0 and the ceiling, so a retry can be immediate. Here the delay is between half the ceiling and the ceiling, which guarantees some wait but spreads less.
</details>
<details><summary>Why have a cap on the delay?</summary>
Doubling grows fast: after ten retries it would be minutes. The cap keeps the wait bounded so the client still recovers soon after the server does.
</details>

← [previous](24-timeouts.md) · [all concepts](../README.md) · [next](26-webhooks.md) →
