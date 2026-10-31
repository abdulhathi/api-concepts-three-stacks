# 08 · API schemas

An API schema is a machine-readable description of every endpoint, input and output, and OpenAPI is the standard format for it.

## Why it matters

- Without a schema, the docs are a wiki page that drifts from the code. With one, the docs are produced from the code.
- Tools read the schema: client generators, mock servers, test tools and the interactive docs page.
- A schema is a contract. A change that breaks it can be caught in review instead of by a customer.

## How it works

The OpenAPI document is JSON with `paths`, `components.schemas` and `components.securitySchemes`. Each operation lists its parameters, request body and responses. A docs UI such as Swagger UI or Scalar reads the JSON and draws a page where you can try each call.

```http
GET /openapi.json HTTP/1.1
Host: localhost:8001
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"openapi":"3.1.0","info":{"title":"Bookshop API","version":"1.0.0"},"paths":{"/v1/products":{"get":{"summary":"..."}}}}
```

There are two ways to get the schema: write the spec first and check the code against it, or write the code and generate the spec. This repo generates it, and the contract tests in `contract-tests/` check the behavior from outside.

## The rule in this repo

- `GET /openapi.json` returns an OpenAPI 3.x document. It needs no token.
- `GET /docs` shows an interactive UI: Swagger UI in the Python and TypeScript servers, Scalar in the C# server.
- The `bearerAuth` security scheme is HTTP bearer with JWT format, so the UI can send the token for you.
- Error responses use the shared `Problem` shape from [27 · Error handling](27-error-handling.md).

## Side by side

### Python · FastAPI
FastAPI builds the document from type hints. Bodies are read by hand here, so this module adds the request-body schemas to the generated document.

```python
def install_openapi(app: FastAPI) -> None:
    def build() -> dict[str, Any]:
        if app.openapi_schema is None:
            schema = get_openapi(
                title=app.title,
                version=app.version,
                description=app.description,
                routes=app.routes,
            )
            components = schema.setdefault("components", {}).setdefault("schemas", {})
            for name, model in _REGISTERED.items():
                generated = model.model_json_schema(by_alias=True, ref_template=_REF_TEMPLATE)
                components.update(generated.pop("$defs", {}))
                components[name] = generated
            app.openapi_schema = schema
```
[`app/web/docs.py` lines 28-42](../../python-fastapi-aws/app/web/docs.py#L28-L42)

### TypeScript · Express
The same zod schemas that validate requests are registered into an OpenAPI 3.1 document, so the docs cannot drift from validation.

```ts
  const bodyOf = (schema: z.ZodType, contentType = 'application/json') => ({
    body: { required: true, content: { [contentType]: { schema } } },
  });

  operation('get', '/health', 'Liveness check', 'Meta', {
    responses: { 200: { description: 'Healthy', ...json(z.object({ status: z.literal('ok') })) } },
  });
  operation('post', '/oauth/token', 'Get an access token (client credentials)', 'Auth', {
    request: bodyOf(tokenRequestSchema, 'application/x-www-form-urlencoded'),
    responses: {
      200: { description: 'Access token', ...json(tokenResponseSchema) },
      400: { description: 'invalid_request, unsupported_grant_type or invalid_scope (RFC 6749 JSON)' },
      401: { description: 'invalid_client (RFC 6749 JSON)' },
    },
  });
```
[`src/openapi/document.ts` lines 111-125](../../node-typescript-gcp/src/openapi/document.ts#L111-L125)

### C# · ASP.NET Core
ASP.NET Core's built-in OpenAPI support emits the document at `/openapi.json`, and the Scalar package serves the UI from it.

```csharp
        app.MapOpenApi("/openapi.json");
        app.MapScalarApiReference("/docs", options => options
            .WithTitle("Bookshop API")
            .WithOpenApiRoutePattern("/openapi.json"));
```
[`src/ApiConcepts.Api/Composition/PipelineSetup.cs` lines 45-48](../../dotnet-azure/src/ApiConcepts.Api/Composition/PipelineSetup.cs#L45-L48)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
curl -s localhost:8001/openapi.json | jq '.paths | keys'
curl -s localhost:8001/openapi.json | jq '.components.securitySchemes'
open http://localhost:8001/docs      # on Linux use xdg-open
```

## In the cloud

- **AWS:** API Gateway can import an OpenAPI file to define routes, and export one from an existing API.
- **GCP:** API Gateway and Cloud Endpoints are configured from an OpenAPI spec; check which OpenAPI versions the service accepts before importing.
- **Azure:** API Management imports an OpenAPI document to create its API definition and developer portal.

## Common mistakes

- Writing the spec by hand once and never checking it, so it quietly describes an older API.
- Documenting only the 200 response. Errors and auth failures are part of the contract.
- Letting the schema leak internals, such as database column names, that clients then depend on.

## Interview questions

<details><summary>What is the difference between OpenAPI and Swagger?</summary>OpenAPI is the specification, formerly called the Swagger specification. Swagger UI and Swagger Editor are tools from the same family that read an OpenAPI document.</details>
<details><summary>Code-first or spec-first?</summary>Code-first is quick and keeps docs in sync, but the spec follows whatever the code does. Spec-first designs the contract before coding and lets teams work in parallel. Either way, test the real behavior.</details>
<details><summary>How does a schema help a team that does not own the API?</summary>They can generate a typed client, run a mock server and write tests before the service exists, using only the document.</details>

← [previous](07-json-and-serialization.md) · [all concepts](../README.md) · [next](09-status-codes.md) →
