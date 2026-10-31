# 17 · GraphQL

GraphQL is a query language and runtime where the client sends one request to a single endpoint and names exactly the fields it wants, including nested ones.

## Why it matters

- With REST, showing an order and its products may take several calls. One GraphQL query fetches the whole tree and nothing extra.
- Without a schema and checks, a single query can ask for huge nested data. Depth limits and per-field authorization are needed.
- Errors work differently: a query can partly succeed, so HTTP status alone no longer tells you what happened.

## How it works

The client posts `{ query, variables }` to `/graphql`. The server checks the query against a typed schema, runs a resolver for each field, and returns `data` plus an optional `errors` list. Execution errors come back with HTTP 200. Problems before execution (no token, no scope) are still normal HTTP errors in this repo.

```http
POST /graphql HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"query":"{ order(id: \"ord_1a2b3c4d5e6f\") { status totalCents items { quantity product { title } } } }"}

HTTP/1.1 200 OK
Content-Type: application/json

{"data":{"order":{"status":"paid","totalCents":6998,"items":[{"quantity":2,"product":{"title":"HTTP from the Ground Up"}}]}}}
```

## The rule in this repo

- `POST /graphql` needs `products:read`. No token is HTTP 401, a token without the scope is HTTP 403, both as problem+json.
- Schema: `products(first, after, tag)`, `product(id)`, `order(id)`. Ids are the plain REST ids (`prd_01`), never Relay-encoded.
- `first` outside 1 to 50 gives a GraphQL error with `extensions.code = "BAD_USER_INPUT"`.
- `order` also needs `orders:read`, else `extensions.code = "FORBIDDEN"` and `data.order = null`. Another client's order is `null`.
- Responses are HTTP 200 with `Content-Type: application/json` when the request sends `Accept: application/json`.

## Side by side

The three stacks use three different libraries: Strawberry (code-first, Python classes), graphql-js with SDL text (schema-first), and Hot Chocolate (code-first, plain C# classes).

### Python · FastAPI
Strawberry builds the schema from decorated classes. The `order` resolver checks the scope itself (field-level authorization), and `QueryDepthLimiter` caps nesting.

```python
if "orders:read" not in principal.scopes:
    raise GraphQLError(
        "The 'orders:read' scope is required to read orders.",
        extensions={"code": "FORBIDDEN"},
    )
found = await info.context.container.orders.get(str(id))
if found is None or not (principal.is_admin or found.client_id == principal.client_id):
    return None
```
[app/gql/schema.py](../../python-fastapi-aws/app/gql/schema.py#L133-L140)

### TypeScript · Express
The schema is written in SDL and compiled with `buildSchema`; `graphql-http` serves it behind one Express route. The `order` resolver checks the scope itself.

```typescript
async order(args: { id: string }, ctx: GraphQLContext) {
  if (!hasScope(ctx.principal, 'orders:read')) {
    throw new GraphQLError('This field needs the orders:read scope', { extensions: { code: 'FORBIDDEN' } });
  }
```
[src/graphql/schema.ts](../../node-typescript-gcp/src/graphql/schema.ts#L79-L82)

### C# · ASP.NET Core
Hot Chocolate turns the public methods of `Query` into fields. `ClaimsPrincipal` is injected, so the resolver can check the scope.

```csharp
if (!user.HasScope("orders:read"))
{
    throw Error("FORBIDDEN", "The token lacks the orders:read scope.");
}
// …
return orders.Find(id) is { } order && (user.IsAdmin() || order.ClientId == user.ClientId())
    ? OrderType.From(order)
    : null;
```
[src/ApiConcepts.Api/GraphQl/Query.cs](../../dotnet-azure/src/ApiConcepts.Api/GraphQl/Query.cs#L52-L60)

## Try it

```bash
# Any stack works; 8001 is Python. The token needs both scopes, so use writer.
TOKEN=$(curl -s -u writer:writer-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)

curl -s http://localhost:8001/graphql \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"query":"{ products(first: 2, tag: \"basics\") { nodes { id title priceCents } pageInfo { endCursor hasNextPage } } }"}' | jq

# No token: a plain HTTP 401 problem, not a GraphQL error
curl -si http://localhost:8001/graphql -H 'Content-Type: application/json' -d '{"query":"{ product(id: \"prd_01\") { id } }"}' | head -n 1
```

## In the cloud

- **AWS:** AWS AppSync is a managed GraphQL service. This repo instead runs GraphQL inside the Lambda.
- **GCP:** nothing extra needed for Cloud Run. Apigee can front a GraphQL endpoint with its own policies.
- **Azure:** API Management can import GraphQL APIs and apply policies. This app runs Hot Chocolate itself.

## Common mistakes

- **Authorizing only the endpoint.** One route-level check cannot protect individual fields. Check scope or ownership in the resolver.
- **No limits.** Without depth, size or cost limits, a nested query can overload the server.
- **Trusting HTTP 200.** The client must read the `errors` array; a 200 response can hold partial data.

## Interview questions

<details><summary>What problem does GraphQL solve compared with REST?</summary>
Over-fetching and under-fetching. The client chooses the fields and gets nested data in one round trip. The price is harder caching, since everything is one POST endpoint, and the need for query limits.
</details>
<details><summary>What is the N+1 problem in GraphQL?</summary>
A list field runs one query, then each item's nested field runs another, so a page of 50 orders may trigger 50 product lookups. The usual fix is batching with a DataLoader.
</details>
<details><summary>Why does a GraphQL error often come with HTTP 200?</summary>
The request was understood and executed, and each field can succeed or fail on its own. Errors go in the <code>errors</code> array next to partial <code>data</code>. Failures before execution, like a missing token, can still use real HTTP statuses, as here.
</details>

← [previous](16-rest.md) · [all concepts](../README.md) · [next](18-pagination.md) →
