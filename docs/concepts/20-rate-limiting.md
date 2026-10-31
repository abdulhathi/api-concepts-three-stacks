# 20 · Rate limiting

Rate limiting caps how many requests one client may make in a period, and answers `429 Too Many Requests` when the cap is reached.

## Why it matters

- One buggy loop or one greedy client can use all your capacity and slow everyone else.
- Without a limit, password guessing, scraping and token abuse cost nothing to attempt.
- Without clear headers, well-behaved clients cannot slow down and have to guess when to retry.

## How it works

This API uses a token bucket per client. The bucket holds up to `limit` tokens and gets tokens back at a steady rate (`limit / 60` per second). Each request takes one token. An empty bucket means 429. A bucket allows short bursts but holds the long-run average to the plan.

`429` comes from RFC 6585. `Retry-After` is defined in RFC 9110. The `RateLimit-*` headers come from an IETF draft (not yet an RFC), so treat their exact form as likely to change.

```http
GET /v1/products HTTP/1.1
Authorization: Bearer <free-plan token>

HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 12
RateLimit-Limit: 5
RateLimit-Remaining: 0
RateLimit-Reset: 12

{"type":"/problems/rate-limited","title":"Too many requests","status":429,
 "detail":"Rate limit of 5 requests per minute exceeded.", ...}
```

## The rule in this repo

- One bucket per client (`sub`). Capacity is the plan limit: **free** 5 per minute, **standard** 1000 per minute.
- It applies to every authenticated `/v1` and `/graphql` request, after authentication. A 401 costs nothing.
- Every such response carries `RateLimit-Limit`, `RateLimit-Remaining` (whole tokens left) and `RateLimit-Reset` (seconds until one more token; 0 while any remain).
- An empty bucket gives 429 `rate-limited` with `Retry-After` (same seconds, at least 1) and the three headers.

## Side by side

### Python · FastAPI
A small class keeps a float token count per client and refills it from a clock you can fake in tests. State is per process.

```python
bucket.tokens = min(float(limit), bucket.tokens + elapsed * refill_per_second)
bucket.updated_at = now

allowed = bucket.tokens >= 1
if allowed:
    bucket.tokens -= 1
remaining = math.floor(bucket.tokens)
reset = 0 if remaining > 0 else math.ceil((1 - bucket.tokens) / refill_per_second)
return Decision(allowed, limit, remaining, reset)
```
[app/auth/ratelimit.py](../../python-fastapi-aws/app/auth/ratelimit.py#L50-L58)

### TypeScript · Express
The same algorithm in a `Map`. The `rateLimit` middleware in the same file writes the headers and throws the 429 problem.

```typescript
bucket.tokens = Math.min(limitPerMinute, bucket.tokens + (now - bucket.updatedAt) * ratePerMs);
bucket.updatedAt = now;

const allowed = bucket.tokens >= 1;
if (allowed) bucket.tokens -= 1;
this.buckets.set(key, bucket);

const remaining = Math.floor(bucket.tokens);
const resetSeconds = remaining > 0 ? 0 : Math.ceil((1 - bucket.tokens) / (ratePerMs * 1000));
return { allowed, limit: limitPerMinute, remaining, resetSeconds };
```
[src/limits/rateLimit.ts](../../node-typescript-gcp/src/limits/rateLimit.ts#L34-L43)

### C# · ASP.NET Core
The built-in `TokenBucketRateLimiter`, one bucket per client from `GetTokenBucketLimiter`. It adds one token every `60/limit` seconds, and it cannot report "remaining", so a [decorator class](../../dotnet-azure/src/ApiConcepts.Api/RateLimiting/ClientRateLimiter.cs#L11) records a snapshot for the headers.

```csharp
private static TokenBucketRateLimiterOptions BucketFor(Plan plan) => new()
{
    TokenLimit = plan.RequestsPerMinute,
    TokensPerPeriod = 1,
    ReplenishmentPeriod = TimeSpan.FromSeconds(60.0 / plan.RequestsPerMinute),
    QueueLimit = 0,
    AutoReplenishment = true,
};
```
[src/ApiConcepts.Api/RateLimiting/ClientRateLimiter.cs](../../dotnet-azure/src/ApiConcepts.Api/RateLimiting/ClientRateLimiter.cs#L36-L43)

## Try it

```bash
# Any stack works; 8001 is Python. The free client has 5 requests per minute.
FREE=$(curl -s -u free:free-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)

# Six calls: five 200s, then a 429
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/v1/products -H "Authorization: Bearer $FREE"
done

# See the headers on the rejected call
curl -si http://localhost:8001/v1/products -H "Authorization: Bearer $FREE" | grep -i -E '^(HTTP|retry-after|ratelimit)'
```

## In the cloud

- **AWS:** API Gateway usage plans with API keys (REST APIs) give per-client quotas. HTTP APIs only have per-stage or per-route throttling, which this template uses. AWS WAF has rate-based rules per IP.
- **GCP:** API Gateway and Cloud Endpoints support quotas per API key. Apigee has quota and spike-arrest policies. Cloud Armor can rate limit per IP.
- **Azure:** API Management has `rate-limit` and `rate-limit-by-key` policies. Azure Front Door WAF has rate limit rules.

## Common mistakes

- **Counting per process only.** With many instances, each keeps its own bucket and the real limit is multiplied. Use a shared store such as Redis.
- **No `Retry-After`.** Clients then retry at once and make the overload worse.
- **Limiting by IP only.** Many users share one IP behind a company proxy, and one user can use many IPs. Prefer the authenticated client.

## Interview questions

<details><summary>How does a token bucket differ from a fixed window counter?</summary>
A fixed window resets on a boundary, so a client can send a full burst at the end of one window and another at the start of the next. A token bucket refills smoothly, so bursts are allowed only up to the bucket size.
</details>
<details><summary>What is the difference between rate limiting and throttling?</summary>
Rate limiting is per client over time and answers 429. Throttling protects the server's capacity, for example a concurrency limit, and often answers 503. The two words are also used loosely, and AWS calls its rate limit "throttling" and returns 429.
</details>
<details><summary>How do you rate limit across several server instances?</summary>
Keep the counters in a shared store (Redis or DynamoDB) and update them atomically. Or limit at a gateway in front of all instances.
</details>

← [previous](19-caching.md) · [all concepts](../README.md) · [next](21-throttling.md) →
