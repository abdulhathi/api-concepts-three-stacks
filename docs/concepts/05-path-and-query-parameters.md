# 05 · Path and query parameters

Path parameters pick one resource out of a collection, and query parameters filter, sort or page the result.

## Why it matters

- Both arrive as plain strings from the URL. If the server does not parse and check them, bad input reaches your code and your data.
- Mixing up the two makes URLs hard to cache and hard to read: identity belongs in the path, options in the query.
- A clear 400 with the field name saves every client developer a round trip to your docs.

## How it works

In `/v1/products/prd_01?limit=5`, the path parameter is `prd_01` (which product) and the query parameter is `limit=5` (how many). The path is part of the resource's identity. The query is optional and may be reordered or left out.

```http
GET /v1/products?limit=3&tag=basics HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

A bad value gets a problem document that names the field:

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{"type":"/problems/validation-error","title":"Your request is not valid","status":400,"detail":"limit must be between 1 and 50","instance":"/v1/products","requestId":"...","errors":[{"field":"limit","message":"must be between 1 and 50"}]}
```

## The rule in this repo

- `GET /v1/products/{id}` takes the product id in the path. An unknown id is `404 not-found`.
- `GET /v1/products` takes `?limit` (integer 1 to 50, default 10), `?cursor` (opaque, from the previous page) and `?tag` (one tag).
- Bad query values are `400 validation-error` with an `errors` array of `{ field, message }`. A cursor the server cannot decode is `400 invalid-cursor`.
- `/v1/echo` returns each query name with its first value, which makes the parsing visible.

## Side by side

### Python · FastAPI
Type hints and `Query(ge=1, le=50)` declare the rules, and FastAPI parses and validates the strings before the handler runs. The path parameter `product_id` is declared in `get_product` in the same way.

```python
@router.get("", response_model=None)
async def list_products(
    request: Request,
    _: Reader,
    container: Services,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    cursor: str | None = None,
    tag: str | None = None,
) -> Response:
    """Keyset-paginated list, ordered by creation time. Follow `Link: rel="next"` for more."""
    after = decode_cursor(cursor) if cursor is not None else None
```
[`app/routes/products.py` lines 56-66](../../python-fastapi-aws/app/routes/products.py#L56-L66)

### TypeScript · Express
Query strings are always strings, so the shared zod helper coerces and range-checks them. The same file defines the `{id}` path schema.

```ts
/** An integer in [min, max], accepted from query strings ("5") as well as JSON numbers. */
export function intInRange(name: string, min: number, max: number) {
  const message = `must be between ${min} and ${max}`;
  return z.coerce
    .number({ error: message })
    .int({ error: message })
    .min(min, { error: message })
    .max(max, { error: message })
    .meta({ description: `${name}, ${min} to ${max}` });
}

/** `{id}` path parameter shared by every resource route. */
export const idParamsSchema = z.object({ id: z.string().min(1) });
```
[`src/http/schemas.ts` lines 4-16](../../node-typescript-gcp/src/http/schemas.ts#L4-L16)

### C# · ASP.NET Core
`PageRequest.From` reads the query by hand and throws a validation problem. The `{id}` path parameter binds straight to `string id` in `ProductEndpoints.Get`.

```csharp
    public static PageRequest From(HttpRequest request)
    {
        var query = request.Query;
        var raw = query["limit"].ToString();
        var limit = DefaultLimit;
        if (raw.Length > 0 &&
            (!int.TryParse(raw, NumberStyles.None, CultureInfo.InvariantCulture, out limit) || limit is < 1 or > 50))
        {
            throw ProblemException.Validation("limit", "must be between 1 and 50");
        }

        return new PageRequest(limit, Cursor.Parse(query.TryGetValue("cursor", out var cursor) ? cursor.ToString() : null));
    }
```
[`src/ApiConcepts.Api/Common/PageRequest.cs` lines 12-24](../../dotnet-azure/src/ApiConcepts.Api/Common/PageRequest.cs#L12-L24)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s 'localhost:8001/v1/products?limit=2&tag=basics' -H "Authorization: Bearer $TOKEN" | jq '.data[].id'
curl -s 'localhost:8001/v1/products?limit=0' -H "Authorization: Bearer $TOKEN" | jq   # 400 with errors[]
curl -s localhost:8001/v1/products/prd_99 -H "Authorization: Bearer $TOKEN" | jq .status   # 404
```

## In the cloud

- **AWS:** API Gateway HTTP APIs pass path and query through as they are. REST APIs (not used here) can mark parameters required.
- **GCP:** nothing extra needed. Cloud Run forwards the full URL to the container.
- **Azure:** nothing extra needed. API Management can validate parameters against an OpenAPI schema if you add it.

## Common mistakes

- Using the query string for secrets. URLs end up in logs, browser history and `Referer` headers.
- Parsing numbers with a lenient function, so `limit=5abc` quietly becomes 5.
- Forgetting to URL-encode values such as cursors when building a link.

## Interview questions

<details><summary>When should data go in the path and when in the query?</summary>The path identifies the resource (`/products/prd_01`). The query shapes how you view a collection (`?tag=basics&limit=5`). If dropping the value would point at a different thing, it belongs in the path.</details>
<details><summary>Why validate path and query parameters on the server?</summary>Clients can send anything, and the URL is just text. Checking type and range at the edge keeps bad data out of business code and gives the caller a specific error.</details>
<details><summary>What happens if the same query name appears twice?</summary>It depends on the framework: some keep the first, some the last, some build a list. This API documents "first value" and the echo endpoint shows it.</details>

← [previous](04-headers.md) · [all concepts](../README.md) · [next](06-request-bodies.md) →
