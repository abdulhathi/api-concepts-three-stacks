# 11 · Authorization

Authorization decides what an authenticated caller may do, here by scopes on the token and by who owns each order.

## Why it matters

- A valid token should not mean full access. A read-only client must not be able to delete products.
- Scope checks alone do not stop one customer from reading another customer's order by guessing an id.
- A wrong answer here is a data breach, not a bug.

## How it works

There are two layers. First, **scopes** say what kind of action the token allows (`products:read`, `orders:write`, `admin`). The server checks them per route. Second, **ownership** says which records the caller may touch. A scope can allow "read orders" while ownership limits it to your own.

```http
POST /v1/products HTTP/1.1
Authorization: Bearer <token for client "reader">
Content-Type: application/json

{"title":"x","author":"y","priceCents":100}
```

```http
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer realm="api-concepts", error="insufficient_scope", scope="products:write"
Content-Type: application/problem+json

{"type":"/problems/forbidden","title":"...","status":403,"detail":"...","instance":"/v1/products","requestId":"..."}
```

## The rule in this repo

- Each route needs one scope (see `SPEC.md`). `DELETE /v1/products/{id}` and `/v1/webhooks` need `admin`.
- A token without the scope gets `403` and a `WWW-Authenticate` header naming the scope it needed (RFC 6750 `insufficient_scope`).
- Orders belong to the client that created them. Another client's order is `404 not-found`, the same as a missing one, so ids cannot be probed. `admin` sees all orders.
- The scope check happens after authentication and after the rate limit, so a 403 still uses a token from the bucket.
- Each client has fixed scopes: `reader` can read, `writer` and `partner` can read and write, `admin` can do everything.

## Side by side

### Python · FastAPI
The ownership rule is one small helper. It raises the same `not-found` problem for "missing" and "not yours". The scope check is in `app/auth/dependencies.py` ([line 62](../../python-fastapi-aws/app/auth/dependencies.py#L62)).

```python
async def _visible_order(container: Container, principal: Principal, order_id: str) -> Order:
    """Another client's order is reported as missing, so ids cannot be probed (concept 11)."""
    order = await container.orders.get(order_id)
    if order is None or not (principal.is_admin or order.client_id == principal.client_id):
        raise Problem("not-found", f"Order '{order_id}' does not exist.")
    return order
```
[`app/routes/orders.py` lines 41-46](../../python-fastapi-aws/app/routes/orders.py#L41-L46)

### TypeScript · Express
Same rule in the service layer. The scope guard is the `requireScope` middleware in `src/auth/authenticate.ts` ([line 38](../../node-typescript-gcp/src/auth/authenticate.ts#L38)).

```ts
  /** Another client's order is reported as missing, so ids cannot be probed. */
  async getVisible(principal: Principal, id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order || !(isAdmin(principal) || order.clientId === principal.clientId)) {
      throw new ApiProblem('not-found', `Order ${id} does not exist.`);
    }
    return order;
  }
```
[`src/orders/service.ts` lines 51-58](../../node-typescript-gcp/src/orders/service.ts#L51-L58)

### C# · ASP.NET Core
Scopes are authorization policies, so a route says `.RequireAuthorization("orders:read")`. The ownership rule is one method. The policies are built in `AuthSetup.cs` ([line 28](../../dotnet-azure/src/ApiConcepts.Api/Auth/AuthSetup.cs#L28)).

```csharp
    /// <summary>Another client's order looks exactly like a missing one (404), so ids cannot be probed.</summary>
    private static Order Visible(Order? order, System.Security.Claims.ClaimsPrincipal user) =>
        order is not null && (user.IsAdmin() || order.ClientId == user.ClientId())
            ? order
            : throw ProblemException.NotFound("Order");
```
[`src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs` lines 136-140](../../dotnet-azure/src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs#L136-L140)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
READER=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -si -X POST localhost:8001/v1/products -H "Authorization: Bearer $READER" -H 'Content-Type: application/json' -d '{"title":"x","author":"y","priceCents":100}' | head -4
# ask for fewer scopes than the client has (least privilege):
curl -s -u admin:admin-secret -d grant_type=client_credentials -d scope=products:read http://localhost:8001/oauth/token | jq -r .scope
```

## In the cloud

- **AWS:** HTTP API JWT authorizers can require scopes per route. IAM policies control who may call the API itself.
- **GCP:** IAM roles such as Cloud Run Invoker decide which identities may reach the service. Fine-grained scopes stay in your app.
- **Azure:** Microsoft Entra ID app roles and scopes put permissions in the token, and API Management policies can check them.

## Common mistakes

- Checking the scope but not the owner (broken object level authorization, the top item on the OWASP API Security list).
- Returning 403 for another user's record. It confirms the record exists.
- Checking permissions only in the UI. The API must enforce them on every call.

## Interview questions

<details><summary>What is a scope?</summary>A named permission carried in the token, such as `orders:read`. The authorization server grants scopes; the API checks them on each route.</details>
<details><summary>Why does this API return 404 for someone else's order?</summary>A 403 tells the caller the order exists. A 404 reveals nothing, so ids cannot be probed.</details>
<details><summary>What is least privilege?</summary>Give each client only the scopes it needs. The token endpoint lets a client ask for fewer scopes than it has, and the token then carries only those.</details>

← [previous](10-authentication.md) · [all concepts](../README.md) · [next](12-access-tokens-and-jwt.md) →
