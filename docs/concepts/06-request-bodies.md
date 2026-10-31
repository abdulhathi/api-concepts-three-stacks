# 06 · Request bodies

A request body is the data a client sends after the headers, usually JSON, so the server can create or change something.

## Why it matters

- The body is untrusted input. Without validation, a wrong type or a missing field becomes a crash or corrupt data.
- Checks that run in the wrong order leak information, for example telling an anonymous caller that their JSON is broken.
- A precise error ("`title` is required") is the difference between a client fixing the call in a minute or in an hour.

## How it works

Only `POST`, `PUT` and `PATCH` carry bodies in this API. The server goes through the same steps every time: authenticate, check the media type, parse the JSON, then validate the shape and the values. Each step has its own error.

```http
POST /v1/products HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{"title":"  Caching 101 ","author":"Ada Lovelace","priceCents":2500,"tags":["caching"]}
```

```http
HTTP/1.1 201 Created
Location: /v1/products/prd_3fa85f64a1b2
ETag: "prd_3fa85f64a1b2-v1"
Content-Type: application/json

{"id":"prd_3fa85f64a1b2","title":"Caching 101","author":"Ada Lovelace","priceCents":2500,"currency":"USD","tags":["caching"],"version":1,"createdAt":"...","updatedAt":"..."}
```

The title was trimmed. Properties the server does not know are ignored, not rejected.

## The rule in this repo

- Wrong `Content-Type`: `415 unsupported-media-type`. Body that is not JSON: `400 malformed-json`. Valid JSON that breaks a rule: `400 validation-error` with `errors[]`.
- Product fields: `title` 1 to 200 characters and `author` 1 to 100 (both trimmed), `priceCents` an integer from 0 to 10,000,000, `tags` at most 10 unique strings matching `^[a-z0-9-]{1,30}$`.
- `POST` needs `title`, `author`, `priceCents` (`tags` defaults to `[]`). `PUT` needs all four. `PATCH` takes any subset, and an explicit `null` is not accepted for a field.
- Validation failures are 400 here, not 422. `422` is kept for business rules such as an unknown product in an order.
- Field names are the contract. The message text is written by each framework and differs between stacks.

## Side by side

### Python · FastAPI
Pydantic models hold the rules. A custom dependency reads the raw body itself, so authentication runs before body errors.

```python
def json_body[M: BaseModel](model: type[M]) -> Callable[[Request], Awaitable[M]]:
    """Dependency factory: `body: Annotated[ProductCreate, Depends(json_body(ProductCreate))]`."""

    async def dependency(request: Request) -> M:
        data = await read_json(request, required=True)
        try:
            return model.model_validate(data)
        except ValidationError as exc:
            raise validation_problem(exc.errors()) from exc

    return dependency
```
[`app/web/body.py` lines 41-51](../../python-fastapi-aws/app/web/body.py#L41-L51)

### TypeScript · Express
The raw bytes are kept (idempotency needs them), parsed once, and a parse failure becomes `malformed-json`. Zod schemas then validate the result.

```ts
const parseJson: RequestHandler = (req, _res, next) => {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    req.rawBody = req.body;
    try {
      req.json = JSON.parse(req.body.toString('utf8'));
    } catch {
      throw new ApiProblem('malformed-json', 'The request body could not be parsed as JSON.');
    }
  }
  next();
};
```
[`src/http/body.ts` lines 22-32](../../node-typescript-gcp/src/http/body.ts#L22-L32)

### C# · ASP.NET Core
The handlers read the raw JSON and check every field by hand, collecting all problems before they fail.

```csharp
    public static ProductFields Parse(JsonElement? raw, ProductInputMode mode)
    {
        var body = JsonBody.RequireObject(raw);
        var errors = new List<FieldIssue>();

        var title = Text(body, "title", 200, mode != ProductInputMode.Patch, errors);
        var author = Text(body, "author", 100, mode != ProductInputMode.Patch, errors);
        var price = Price(body, mode != ProductInputMode.Patch, errors);
        var tags = Tags(body, mode == ProductInputMode.Replace, errors);

        if (errors.Count > 0)
        {
            throw ProblemException.Validation([.. errors]);
        }
```
[`src/ApiConcepts.Api/Endpoints/ProductInput.cs` lines 17-30](../../dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductInput.cs#L17-L30)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
TOKEN=$(curl -s -u writer:writer-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s -X POST localhost:8001/v1/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"Caching 101","author":"Ada","priceCents":2500}' | jq
curl -s -X POST localhost:8001/v1/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{oops' | jq .type   # malformed-json
curl -s -X POST localhost:8001/v1/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"x","author":"y","priceCents":12.5}' | jq .errors
```

## In the cloud

- **AWS:** API Gateway REST APIs can validate a body against a JSON Schema model. The HTTP API used here passes the body through, with a 10 MB limit.
- **GCP:** nothing extra needed for validation. Cloud Run accepts requests up to 32 MiB.
- **Azure:** API Management has a `validate-content` policy if you want checks before the app. Otherwise nothing extra is needed.

## Common mistakes

- Reading the body before checking who is calling, so anonymous callers can probe your parser.
- Accepting a float for money (`12.5`) and rounding it later. Reject it, or use integer cents.
- Trusting client-sent fields such as `id`, `version` or `createdAt`. The server sets those.

## Interview questions

<details><summary>Should a failed validation be 400 or 422?</summary>Both are used. 400 means the request is malformed. 422 (RFC 9110) means the syntax is fine but the content cannot be processed. This repo uses 400 for shape and rule failures and keeps 422 for business conflicts.</details>
<details><summary>Why return every validation error at once?</summary>The client can fix all fields in one round trip instead of one error per call.</details>
<details><summary>Why cap the size of a request body?</summary>Unbounded bodies let one client use up memory or time. Express here limits the raw body to 256 KB, and the edge services have their own limits.</details>

← [previous](05-path-and-query-parameters.md) · [all concepts](../README.md) · [next](07-json-and-serialization.md) →
