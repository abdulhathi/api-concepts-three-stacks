# 16 · REST

REST is an architectural style where an API exposes resources (nouns) at URLs and uses the standard HTTP methods, status codes and headers to work with them.

## Why it matters

- A uniform shape means a client that can use one resource can use the next. No custom verbs to learn.
- Plain HTTP semantics (safe GETs, cacheable responses, standard status codes) let browsers, proxies and CDNs help without special code.
- Stateless requests (each one carries its own token) mean any server instance can answer, so you can scale out.

## How it works

Roy Fielding described REST in his 2000 dissertation. The ideas that matter in practice: identify things with URLs (`/v1/products/prd_01`), act on them with methods (GET reads, POST creates, PUT replaces, PATCH changes, DELETE removes), return a representation (JSON), keep the server stateless, and point the client at related URLs instead of making it build them. Many "REST" APIs stop short of the last part. This one adds the two standard link headers: `Location` (RFC 9110) after a create and `Link` (RFC 8288) for the next page.

```http
POST /v1/products HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"title":"REST in Practice","author":"A. Writer","priceCents":1999}

HTTP/1.1 201 Created
Location: /v1/products/prd_3fa91c07d2e4
ETag: "prd_3fa91c07d2e4-v1"
Content-Type: application/json
```

## The rule in this repo

- Resources are nouns under `/v1`: `/v1/products`, `/v1/orders`, `/v1/webhooks`. The method says the verb.
- A create answers `201` with a `Location` header (`/v1/products/<id>`, `/v1/orders/<id>`) and the new resource in the body.
- A list with more results sends `Link: </v1/products?limit=10&cursor=...>; rel="next"`.
- The one action that is not CRUD is a sub-resource: `POST /v1/orders/{id}/pay`.
- Every error has the same shape (concept 27), and every request is authenticated on its own.

## Side by side

### Python · FastAPI
A router with a decorator per method and path. The create handler sets the status and `Location`; the `Link` header comes from `next_link` ([pagination.py](../../python-fastapi-aws/app/web/pagination.py#L77)).

```python
async def create_product(
    _: Writer,
    container: Services,
    body: Annotated[ProductCreate, Depends(json_body(ProductCreate))],
) -> Response:
    product = await container.product_service.create(body)
    return _representation(product, 201, {"Location": f"/v1/products/{product.id}"})
```
[app/routes/products.py](../../python-fastapi-aws/app/routes/products.py#L101-L107)

### TypeScript · Express
`Router()` with one handler per verb and path. `Location` is set before the shared `sendProduct` helper writes the 201.

```typescript
router.post('/', requireScope('products:write'), jsonBody, async (req, res) => {
  // …
  await products.save(product);
  res.setHeader('Location', `/v1/products/${product.id}`);
  sendProduct(res, 201, product);
```
[src/products/routes.ts](../../node-typescript-gcp/src/products/routes.ts#L71-L84)

### C# · ASP.NET Core
Minimal API handlers mapped with `MapPost`, `MapGet` and so on. The list handler builds its `Link` header in [NextLink](../../dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L65).

```csharp
private static async Task<IResult> Create(HttpContext http, IProductRepository repo, TimeProvider time)
    // …
    http.Response.Headers.Location = $"/v1/products/{product.Id}";
    http.Response.Headers.ETag = ETags.ForProduct(product.Id, product.Version);
    return Results.Json(product, statusCode: 201);
```
[src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs](../../dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs#L85-L94)

## Try it

```bash
# Any stack works; 8001 is Python. The writer client has write scopes.
TOKEN=$(curl -s -u writer:writer-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)

# Create: expect 201 and a Location header
curl -si -X POST http://localhost:8001/v1/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"REST in Practice","author":"A. Writer","priceCents":1999}' | head -n 12

# Follow a list link instead of building the URL yourself
curl -si "http://localhost:8001/v1/products?limit=2" -H "Authorization: Bearer $TOKEN" | grep -i '^link'
```

## In the cloud

- **AWS:** API Gateway maps method and path routes to Lambda. The resource design is yours; nothing extra is needed.
- **GCP:** nothing extra needed. Cloud Run serves whatever routes the app defines. API Gateway can sit in front using an OpenAPI file.
- **Azure:** nothing extra needed. API Management can front the app and publish the same OpenAPI document.

## Common mistakes

- **Verbs in URLs.** `/getProduct` or `/deleteOrder` duplicates what the method already says.
- **Wrong status on create.** Returning `200` with no `Location` leaves the client guessing where the new resource lives.
- **Hidden state on the server.** Relying on a session instead of a token on each request breaks scaling and caching.

## Interview questions

<details><summary>What makes an API RESTful?</summary>
Resources identified by URLs, a uniform interface using HTTP methods and status codes, stateless requests, and representations such as JSON. Strictly, hypermedia (links that drive the client) is part of it too, but most APIs only partly do that.
</details>
<details><summary>How do you model an action that is not CRUD, like paying an order?</summary>
Make it a sub-resource or a state change. Here it is <code>POST /v1/orders/{id}/pay</code>: POST because it has a side effect, and calling it twice leaves the order paid, so the second call returns 200 unchanged.
</details>
<details><summary>What does <code>201 Created</code> with a <code>Location</code> header give the client?</summary>
It confirms a new resource exists and gives its URL. The client can fetch or link to it without knowing how the server builds ids.
</details>

← [previous](15-cors.md) · [all concepts](../README.md) · [next](17-graphql.md) →
