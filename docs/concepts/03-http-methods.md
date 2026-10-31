# 03 · HTTP methods

An HTTP method is the verb of a request: it tells the server whether to read, create, replace, change or delete.

## Why it matters

- Caches, proxies and retry logic treat methods differently. A `GET` can be cached and retried; a `POST` cannot be assumed safe to repeat.
- Using `POST` for everything hides intent and removes all of that help.
- `PUT` and `PATCH` are not the same. Mixing them up silently erases fields or ignores changes.

## How it works

RFC 9110 defines two properties. A method is **safe** if it does not change state (`GET`). It is **idempotent** if repeating it has the same effect as doing it once (`GET`, `PUT`, `DELETE`). `POST` and `PATCH` are neither by default.

| Method | Meaning on a product | Safe | Idempotent | Success |
|---|---|---|---|---|
| `GET` | read | yes | yes | 200 (or 304) |
| `POST` | create in the collection | no | no | 201 + `Location` |
| `PUT` | replace the whole item | no | yes | 200 |
| `PATCH` | change some fields | no | not guaranteed | 200 |
| `DELETE` | remove | no | yes | 204 |

```http
PATCH /v1/products/prd_01 HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
If-Match: "prd_01-v1"

{"priceCents":3000}
```

```http
HTTP/1.1 200 OK
ETag: "prd_01-v2"

{"id":"prd_01","title":"HTTP from the Ground Up","priceCents":3000,"version":2, "...":"..."}
```

## The rule in this repo

- `POST /v1/products` returns 201 with `Location: /v1/products/<id>`. It needs `products:write`.
- `PUT` needs every field (`title`, `author`, `priceCents`, `tags`). A missing field is a `400 validation-error`.
- `PATCH` takes any subset and accepts `application/json` or `application/merge-patch+json`. Only the fields you send change.
- Every change adds 1 to `version`. `PUT`, `PATCH` and `DELETE` honor `If-Match`.
- `DELETE` needs the `admin` scope and returns 204.

## Side by side

### Python · FastAPI
Each method has its own route function. The replace and patch rules live in a service: `replace` writes every field, and `patch` uses `exclude_unset` so only sent fields change.

```python
    async def replace(self, current: Product, data: ProductReplace) -> Product:
        return await self._update(current, data.model_dump(by_alias=False))

    async def patch(self, current: Product, data: ProductPatch) -> Product:
        changes = data.model_dump(by_alias=False, exclude_unset=True)
        return await self._update(current, changes) if changes else current
```
[`app/services/products.py` lines 31-36](../../python-fastapi-aws/app/services/products.py#L31-L36)

### TypeScript · Express
`router.patch` validates with a partial schema, then spreads the validated fields over the current product.

```ts
  router.patch('/:id', requireScope('products:write'), jsonBody, async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    const changes = parse(patchProductSchema, req.json);
    const current = await products.findById(id);
    if (!current) throw notFound(id);
    checkPrecondition(req, current);
    // zod leaves absent keys out, so spreading only overwrites what the client sent.
    const updated: Product = { ...current, ...changes, version: current.version + 1, updatedAt: isoTimestamp(Date.now()) };
    await products.save(updated);
    sendProduct(res, 200, updated);
  });
```
[`src/products/routes.ts` lines 98-108](../../node-typescript-gcp/src/products/routes.ts#L98-L108)

### C# · ASP.NET Core
`MapPut`, `MapPatch` and `MapDelete` (and `MapPost` just above) bind each method to a handler, with its required scope.

```csharp
        products.MapPut("/{id}", Replace).RequireAuthorization("products:write")
            .WithSummary("Replace a product (honours If-Match)")
            .WithBody<ProductBody>("application/json")
            .Produces<Product>();
        products.MapPatch("/{id}", Patch).RequireAuthorization("products:write")
            .WithSummary("Change some fields of a product (honours If-Match)")
            .WithBody<ProductBody>("application/json", "application/merge-patch+json")
            .Produces<Product>();
        products.MapDelete("/{id}", Delete).RequireAuthorization("admin")
            .WithSummary("Delete a product (honours If-Match)")
            .Produces(204);
```
[`src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs` lines 26-36](../../dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L26-L36)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
TOKEN=$(curl -s -u writer:writer-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s -X PATCH localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"priceCents":3000}' | jq
curl -s -X PUT localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"x"}' | jq   # 400: PUT needs every field
```

## In the cloud

- **AWS:** API Gateway can restrict a route to one method (`GET /v1/products`). This repo routes `ANY` and lets the app decide.
- **GCP:** nothing extra needed. Cloud Run passes every method through to the container.
- **Azure:** nothing extra needed. API Management can limit methods per operation if you add it.

## Common mistakes

- Using `PUT` for a partial update. A client that sends one field then wipes the rest.
- Using `GET` for actions that change state. Crawlers, prefetchers and caches will call it.
- Returning 200 with an empty body for `DELETE`. Use 204, which says "done, nothing to show".

## Interview questions

<details><summary>What is the difference between PUT and PATCH?</summary>`PUT` replaces the whole resource with the body, so missing fields are removed or rejected. `PATCH` applies a partial change. `PUT` is idempotent; `PATCH` may not be.</details>
<details><summary>What does idempotent mean, and which methods are?</summary>Repeating the request leaves the server in the same state as one call. `GET`, `PUT`, `DELETE`, `HEAD` and `OPTIONS` are idempotent by definition in RFC 9110. `POST` is not.</details>
<details><summary>Why is DELETE idempotent if the second call returns 404?</summary>Idempotent is about server state, not the response. After one or ten deletes the item is gone either way.</details>

← [previous](02-endpoints.md) · [all concepts](../README.md) · [next](04-headers.md) →
