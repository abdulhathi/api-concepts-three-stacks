# Bookshop API: C# on .NET 9 for Azure

The Bookshop API contract (see `../SPEC.md`) implemented with ASP.NET Core **Minimal APIs**, deployable to **Azure App Service** with Bicep. It is one of three implementations of the same contract and demonstrates 27 API concepts: HTTP basics, auth (JWT, OAuth 2.0), CORS, GraphQL, pagination, caching, rate limiting, throttling, idempotency, retries, timeouts, backoff, webhooks and error handling.

Everything runs locally with no database, no Docker and no cloud account: storage is in memory and seeded on start. A concept-by-concept map with code links, tests and `curl` commands is in [CONCEPTS.md](CONCEPTS.md).

| | |
|---|---|
| Runtime | .NET 9 (`net9.0`), ASP.NET Core Minimal APIs, route groups, endpoint files |
| Auth | `Microsoft.AspNetCore.Authentication.JwtBearer`, tokens issued with `Microsoft.IdentityModel.JsonWebTokens` |
| Errors | RFC 9457 problem details, `IExceptionHandler` |
| Limits | built-in rate limiter (token bucket per client, concurrency limiter for reports), RequestTimeouts middleware |
| Docs | `Microsoft.AspNetCore.OpenApi` at `/openapi.json`, Scalar at `/docs` |
| GraphQL | HotChocolate 16 |
| Client | typed `HttpClient` with `Microsoft.Extensions.Http.Resilience` (Polly v8) |
| Cloud | Azure App Service (Linux), Key Vault, Application Insights, all in `infra/azure/main.bicep` |

## Run

Requires the .NET 9 SDK.

```bash
dotnet run --project src/ApiConcepts.Api     # http://localhost:8003
```

`PORT` overrides the port. The other settings are environment variables with the names from the spec: `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `TOKEN_TTL_SECONDS`, `CORS_ORIGINS`, `REQUEST_TIMEOUT_MS`, `WEBHOOK_RETRY_BASE_MS`, `WEBHOOK_MAX_ATTEMPTS`. The default `JWT_SECRET` is for local development only.

Open the docs UI at <http://localhost:8003/docs/> (the OpenAPI document is at `/openapi.json`).

Try the retry client against the running server:

```bash
dotnet run --project examples/RetryDemo
# attempt 1 failed (503); retrying in 120 ms
# attempt 2 failed (503); retrying in 243 ms
# attempt 3 succeeded: key=demo-8dcb8fc8216
```

## Test

```bash
dotnet test
```

The suite hosts the API in memory with `WebApplicationFactory` (no network). There is at least one test per concept; test names start with the concept number, for example `Test_20_Rate_Limit_Returns_429_With_Retry_After_When_The_Bucket_Is_Empty`. Run one concept with `dotnet test --filter "FullyQualifiedName~Test_22_"`.

## Try it

Demo OAuth clients (dev only): `reader`, `writer`, `partner`, `admin`, `free`, each with the secret `<id>-secret`. `free` is limited to 5 requests per minute.

```bash
tok() { curl -s -X POST localhost:8003/oauth/token -u "$1:$1-secret" -d grant_type=client_credentials | jq -r .access_token; }
TOKEN=$(tok reader); ADMIN=$(tok admin)

# a page of products, then the next page through the Link header
curl -si "localhost:8003/v1/products?limit=3" -H "Authorization: Bearer $TOKEN"

# conditional GET: 304 with no body
curl -si localhost:8003/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" -H 'If-None-Match: "prd_01-v1"'

# an error is a problem document
curl -s localhost:8003/v1/products/nope -H "Authorization: Bearer $TOKEN"

# an idempotent order: send it twice, the second answer has Idempotent-Replayed: true
for i in 1 2; do
  curl -si -X POST localhost:8003/v1/orders -H "Authorization: Bearer $ADMIN" \
    -H "Content-Type: application/json" -H "Idempotency-Key: demo-1" \
    -d '{"items":[{"productId":"prd_01","quantity":2}]}' | grep -iE '^HTTP|idempotent|"id"'
done

# GraphQL, with the nested order -> product query
curl -s localhost:8003/graphql -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
  -d '{"query":"{ products(first:2){ nodes{ id title } } }"}'
```

## Project layout

```
ApiConcepts.sln
Directory.Build.props          net9.0, nullable, warnings as errors
Directory.Packages.props       all NuGet versions, pinned in one place
src/ApiConcepts.Api/
  Program.cs                   host, logging, port
  AppSettings.cs               environment variables -> typed settings
  Composition/                 ServiceRegistration (DI) and PipelineSetup (middleware order + routes)
  Endpoints/                   one static class per resource: products, orders, reports, demo, webhooks, system
  Auth/                        JwtBearer setup, scope policies, token service, OAuth endpoint, demo clients
  RateLimiting/                token bucket per client + concurrency limiter for reports
  Http/                        request id, security headers, cache default, request log, CORS Vary, JSON body filter
  Common/                      problem details, cursor paging, ETags, JSON helpers
  Domain/  Storage/            records, repository interfaces, in-memory implementations, seed data
  Orders/                      order pricing and the idempotency store
  Webhooks/                    publisher, background worker, HMAC signing, backoff
  GraphQl/                     HotChocolate query and types
src/ApiConcepts.Client/        typed client: token cache, Polly retry/timeout pipeline, webhook signature verifier
examples/RetryDemo/            prints each retry attempt and its delay
tests/ApiConcepts.Tests/       xUnit + WebApplicationFactory
infra/azure/                   main.bicep and deploy.sh
```

## Deploy to Azure

`infra/azure/main.bicep` creates a Linux App Service plan and Web App (`DOTNETCORE|9.0`, `httpsOnly: true`, TLS 1.2 minimum, FTPS off, health check on `/health`), a Key Vault holding `JWT_SECRET` (read through a Key Vault reference using the app's system-assigned managed identity and the "Key Vault Secrets User" role), and Application Insights on a Log Analytics workspace.

Prerequisites: the Azure CLI (`az`), the .NET 9 SDK, `zip` and `openssl`.

```bash
az login
az account set --subscription "<your subscription id>"

# one command: resource group, Bicep deployment, dotnet publish, zip deploy, smoke test
infra/azure/deploy.sh
```

The script is these steps, which you can also run by hand:

```bash
RG=rg-api-concepts; LOCATION=eastus
az group create --name $RG --location $LOCATION

az deployment group create --resource-group $RG --name api-concepts \
  --template-file infra/azure/main.bicep \
  --parameters jwtSecret="$(openssl rand -hex 32)" corsOrigins="https://my-frontend.example"

APP=$(az deployment group show -g $RG -n api-concepts --query properties.outputs.webAppName.value -o tsv)
dotnet publish src/ApiConcepts.Api -c Release -o publish && (cd publish && zip -r ../app.zip .)
az webapp deploy --resource-group $RG --name $APP --src-path app.zip --type zip

curl "https://$(az webapp show -g $RG -n $APP --query defaultHostName -o tsv)/health"
```

Optional environment variables for the script: `RESOURCE_GROUP`, `LOCATION`, `APP_NAME`, `SKU`, `CORS_ORIGINS`, `JWT_SECRET`. Clean up with `az group delete --name rg-api-concepts`.

Notes:

- TLS ends at the App Service front end. It forwards plain HTTP and sets `X-Forwarded-Proto: https`, which is what the HSTS logic (concept 14) reads. App Service sets the app's listen port to 8080, so the Bicep sets `PORT=8080`.
- Application Insights is wired through `APPLICATIONINSIGHTS_CONNECTION_STRING`. Enable the platform's auto-instrumentation in the portal, or add the `Azure.Monitor.OpenTelemetry.AspNetCore` package for in-process telemetry. The JSON request log lines also land in the App Service log stream (`az webapp log tail`).
- A new `JWT_SECRET` invalidates tokens issued earlier; reruns of `deploy.sh` generate a new one unless you pass `JWT_SECRET`.

## Production notes

This is a teaching project. What changes on the way to production:

- **In-memory store -> managed database.** Products, orders and webhook records sit behind the repository interfaces in `Storage/Repositories.cs`. Implement them on **Azure Cosmos DB** (partition by client id for orders) or **Azure SQL Database** and register them in `ServiceRegistration`; the endpoints do not change. The keyset cursor (`createdAt`, `id`) maps directly onto a sorted index.
- **Per-instance rate-limit and idempotency state -> shared cache.** The token buckets and the idempotency store live in one process, so with more than one App Service instance each instance enforces its own limits and could miss a replay. Move both to **Azure Cache for Redis** (a Lua script or `INCR` with expiry for buckets; `SET key NX` with a 24 hour TTL for idempotency keys).
- **Edge rate limiting.** Put **Azure API Management** (or Front Door with WAF rate-limit rules) in front, and enforce limits at the edge with the `rate-limit-by-key` and `quota-by-key` policies keyed on the JWT `sub` claim. The in-app limiter then becomes the second line of defence.
- **Background webhook delivery -> a queue.** Delivery runs on a `Channel<T>` inside the web process, so a restart loses pending deliveries. Publish events to **Azure Service Bus** (or **Azure Storage Queues** for the cheapest option) and run the delivery loop as a separate worker (an Azure Functions queue trigger, or a Container Apps / WebJob worker). Service Bus gives you dead-letter queues and delayed redelivery to replace the hand-rolled backoff.
- **Demo clients -> a real identity provider.** The five hard-coded clients and the HS256 shared secret are for the demo. Use **Microsoft Entra ID** (app registrations and the client credentials flow) and validate its RS256 tokens by pointing `JwtBearer` at the tenant's authority; the scope policies stay as they are. Keep any remaining secrets in Key Vault.
- **Operations.** Add a staging slot with swap, autoscale rules, Application Insights alerts on 5xx and `RateLimit` rejections, and a managed certificate and custom domain on the Web App.
