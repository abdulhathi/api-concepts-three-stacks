# 02 · Endpoints

An endpoint is one URL path plus an HTTP method that the server answers with a specific behavior.

## Why it matters

- Clients can only call what you name. Clear, stable paths are the whole public surface of the API.
- Without a version prefix, any breaking change forces every client to change on the same day.
- Unknown paths must fail the same way every time, or clients cannot tell a typo from an outage.

## How it works

A path names a thing (a noun), and the method says what to do with it. `/v1/products` is the collection, and `/v1/products/prd_01` is one item in it. The `/v1` prefix is the API version, so a future `/v2` can live next to it.

```http
GET /v1/products/prd_01 HTTP/1.1
Host: localhost:8001
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

A path nobody serves gets a problem document, not an HTML error page:

```http
HTTP/1.1 404 Not Found
Content-Type: application/problem+json

{"type":"/problems/not-found","title":"Resource not found","status":404,"detail":"...","instance":"/v1/nope","requestId":"..."}
```

## The rule in this repo

- Public, no token: `GET /`, `GET /health`, `GET /openapi.json`, `GET /docs`, `POST /oauth/token`.
- Everything else lives under `/v1` (plus `POST /graphql`) and needs a bearer token.
- Resources are plural nouns: `/v1/products`, `/v1/orders`, `/v1/webhooks`. Actions that are not CRUD get a verb under the item: `POST /v1/orders/{id}/pay`.
- An unknown route is `404` with the `not-found` problem. The wording of `detail` differs per stack.

## Side by side

### Python · FastAPI
Each router is a module with a prefix and is attached with `include_router`. These are the public entry points.

```python
@router.get("/", tags=["System"], include_in_schema=False)
async def index() -> dict[str, str]:
    return {"name": "Bookshop API", "docs": "/docs", "openapi": "/openapi.json"}


@router.get("/health", tags=["System"])
async def health() -> dict[str, str]:
    """Liveness probe. Not authenticated and never rate limited."""
    return {"status": "ok"}
```
[`app/routes/system.py` lines 15-23](../../python-fastapi-aws/app/routes/system.py#L15-L23)

### TypeScript · Express
Express mounts routers by path prefix. Everything under `/v1` shares one chain of middleware (`noStoreByDefault`, authentication, rate limiting).

```ts
  app.use('/oauth', noStoreByDefault, oauthRouter(tokens, clients));

  // Everything below needs a valid token, then spends one token from the caller's rate-limit bucket.
  const protectedRoutes = [noStoreByDefault, authenticate(tokens, clients), rateLimit(limiter)];

  const v1 = Router();
  v1.use('/products', productsRouter(products));
  v1.use('/orders', ordersRouter(orders, idempotency));
  v1.use('/reports', reportsRouter(orderRepository, config.requestTimeoutMs));
  v1.use('/webhooks', webhooksRouter(webhookRepository));
  v1.use(demoRouter());
  app.use('/v1', ...protectedRoutes, v1);

  app.post('/graphql', ...protectedRoutes, jsonBody, requireScope('products:read'), graphqlHandler(products, orders));
```
[`src/app.ts` lines 83-96](../../node-typescript-gcp/src/app.ts#L83-L96)

### C# · ASP.NET Core
Minimal APIs map routes into groups. The `/v1` group requires authorization once, and every route below inherits it.

```csharp
        app.MapSystem();
        app.MapOAuth();

        var v1 = app.MapGroup("/v1")
            .RequireAuthorization()
            .AddEndpointFilter<JsonBodyFilter>();
        v1.MapIdentity();
        v1.MapProducts();
        v1.MapOrders();
        v1.MapReports();
        v1.MapDemo();
        v1.MapWebhooks();

        app.MapGraphQL("/graphql").RequireAuthorization("products:read");
```
[`src/ApiConcepts.Api/Composition/PipelineSetup.cs` lines 30-43](../../dotnet-azure/src/ApiConcepts.Api/Composition/PipelineSetup.cs#L30-L43)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
curl -s localhost:8001/                       # public index
curl -s localhost:8001/health                 # liveness probe
curl -s localhost:8001/v1/products            # 401: /v1 needs a token
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s localhost:8001/v1/nope -H "Authorization: Bearer $TOKEN" | jq   # 404 problem+json
```

## In the cloud

- **AWS:** API Gateway HTTP API routes by path and method. This repo uses a catch-all `/{proxy+}` route so FastAPI does the routing inside Lambda.
- **GCP:** Cloud Run exposes one HTTPS URL per service, and Express does all the routing. API Gateway or Cloud Endpoints is optional.
- **Azure:** App Service gives one hostname per app, and ASP.NET Core routes inside it. API Management can sit in front when you need per-route policies.

## Common mistakes

- Putting verbs in paths (`/v1/getProduct`). The method already says "get".
- Skipping the version prefix, then having no clean way to ship a breaking change.
- Returning an HTML 404 page from an API. Clients parse errors as JSON.

## Interview questions

<details><summary>What is the difference between a resource and an endpoint?</summary>A resource is the thing (a product). An endpoint is a path and method that exposes it, such as `GET /v1/products/prd_01`. One resource usually has several endpoints.</details>
<details><summary>Why version an API in the path?</summary>It is visible, easy to route and easy to cache. Old clients keep calling `/v1` while new ones move to `/v2`. Header-based versioning works too but is easier to get wrong.</details>
<details><summary>Collection or item: where does POST go?</summary>`POST` creates, so it goes on the collection (`POST /v1/products`). The server picks the new id and returns it in `Location`. `PUT` and `PATCH` go on the item.</details>

← [previous](01-requests-and-responses.md) · [all concepts](../README.md) · [next](03-http-methods.md) →
