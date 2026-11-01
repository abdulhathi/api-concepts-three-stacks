# Bookshop API: Python, FastAPI, AWS Lambda

The Bookshop API contract (see [`../SPEC.md`](../SPEC.md)) implemented with **FastAPI**, **Pydantic v2** and
**Strawberry GraphQL**, packaged for **AWS Lambda behind an API Gateway HTTP API** with AWS SAM. It demonstrates
27 API concepts end to end: [CONCEPTS.md](CONCEPTS.md) maps each one to code, tests and a curl command.

- Local port: **8001**. Storage is in memory (seeded on start): no database, no Docker, no cloud account needed.
- Python 3.12 or newer (developed on 3.14, Lambda runs 3.13).
- Includes the typed async client library ([`bookshop_client/`](bookshop_client)) and a retry demo script.

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m app            # http://localhost:8001  (docs at /docs)
```

Settings come from the environment with the same names in every stack of this repo: `PORT`, `JWT_SECRET`,
`JWT_ISSUER`, `JWT_AUDIENCE`, `TOKEN_TTL_SECONDS`, `CORS_ORIGINS`, `REQUEST_TIMEOUT_MS`, `WEBHOOK_RETRY_BASE_MS`,
`WEBHOOK_MAX_ATTEMPTS` (see [`app/config.py`](app/config.py)). `HOST` (default `127.0.0.1`) is local only.

## Test

```bash
.venv/bin/pytest                   # 116 tests, in-process (httpx ASGITransport and MockTransport), about 4 s
.venv/bin/ruff check . && .venv/bin/mypy
```

Tests need no running server and no network. Every test name starts with its concept number
(`test_20_rate_limit_returns_429_with_retry_after`); the full list per concept is in [CONCEPTS.md](CONCEPTS.md).

## Try it

```bash
# 1. Get a token (OAuth 2.0 client credentials). Demo clients: reader, writer, partner, admin, free.
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials localhost:8001/oauth/token \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# 2. Who am I, and a page of products with its Link header and ETag
curl -s localhost:8001/v1/me -H "Authorization: Bearer $TOKEN"
curl -si 'localhost:8001/v1/products?limit=3' -H "Authorization: Bearer $TOKEN"

# 3. A 404 problem (RFC 9457)
curl -si localhost:8001/v1/products/nope -H "Authorization: Bearer $TOKEN"

# 4. Conditional GET: 304 with no body
curl -si localhost:8001/v1/products/prd_01 -H "Authorization: Bearer $TOKEN" -H 'If-None-Match: "prd_01-v1"'

# 5. Idempotent order (needs a client with orders:write); run the second command twice and compare
WRITER=$(curl -s -u writer:writer-secret -d grant_type=client_credentials localhost:8001/oauth/token \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -si -X POST localhost:8001/v1/orders -H "Authorization: Bearer $WRITER" -H 'Idempotency-Key: demo-1' \
  -H 'Content-Type: application/json' -d '{"items":[{"productId":"prd_01","quantity":2}]}'

# 6. GraphQL
curl -s localhost:8001/graphql -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"{ products(first: 2) { nodes { id title } pageInfo { endCursor hasNextPage } } }"}'

# 7. Client retries with backoff against the flaky endpoint
.venv/bin/python -m examples.retry_demo
```

The demo clients and their secrets are public (they are in the spec and in `app/auth/clients.py`). They exist for
learning only: never deploy this API to the internet with them.

## Project layout

```text
app/
  main.py              app factory: routers, error handlers, middleware order
  lambda_handler.py    Mangum entry point for AWS Lambda
  aws.py               reads the JWT secret from SSM Parameter Store on cold start
  config.py container.py   settings from env; wiring of every collaborator (tests swap parts)
  web/                 HTTP plumbing: problems, errors, middleware, body parsing, ETags, pagination, signatures
  auth/                JWT tokens, OAuth token endpoint, rate limiter, auth dependency
  models/              Pydantic request and response models (camelCase aliases)
  repositories/        storage interfaces + in-memory implementations (products, orders, webhooks, idempotency)
  services/            business rules: products, orders, report + timeout, concurrency gate, webhook dispatcher
  routes/              one router per resource
  gql/schema.py        Strawberry schema
bookshop_client/       typed client: token cache, retries, per-attempt timeout, backoff
examples/retry_demo.py prints each retry and its delay
tests/                 one or more tests per concept
infra/aws/             SAM template + notes;  Makefile builds the Lambda package
```

## Deploy to AWS

Prerequisites: an AWS account, the [AWS CLI](https://docs.aws.amazon.com/cli/) and the
[SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html),
credentials configured (`aws configure`). Nothing below runs automatically; read
[`infra/aws/template.yaml`](infra/aws/template.yaml) first.

```bash
# 0. Replace the demo OAuth clients in app/auth/clients.py first (or put an identity provider in front).

# 1. Store the JWT signing key as an encrypted parameter (name must match the template parameter)
aws ssm put-parameter --name /api-concepts/jwt-secret --type SecureString \
  --value "$(openssl rand -hex 32)"

# 2. Validate, then build (uses ./Makefile to fetch Lambda-compatible arm64 wheels)
sam validate --lint --template-file infra/aws/template.yaml
sam build --template-file infra/aws/template.yaml

# 3. Deploy; --guided asks for stack name, region and parameters, and saves samconfig.toml
sam deploy --guided
#    CorsOrigins          your browser app's origin, e.g. https://app.example.com
#    ThrottleRateLimit    steady requests per second at the API Gateway stage (default 50)
#    ThrottleBurstLimit   burst capacity (default 100)

# 4. Call it (ApiUrl is printed as a stack output; TLS ends at API Gateway)
API=$(aws cloudformation describe-stacks --stack-name <your-stack> \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
curl -si "$API/health"        # includes Strict-Transport-Security because X-Forwarded-Proto is https
sam logs --stack-name <your-stack> --tail

# 5. Remove everything when done
sam delete
```

## Production notes

- **In-memory store to a managed database.** Repositories are small interfaces (`app/repositories`); implement them
  on **Amazon DynamoDB** (single-table design, `createdAt#id` as the sort key makes the keyset cursors natural) or
  **Amazon RDS / Aurora Serverless** and swap them in `Container.build`.
- **Per-instance state to a shared cache.** The token bucket (`app/auth/ratelimit.py`) and the idempotency store
  live in one Lambda instance's memory, so each of the many concurrent instances counts separately. Move them to
  **Amazon ElastiCache (Redis/Valkey)** with atomic scripts, or to DynamoDB conditional writes for idempotency keys
  (with a TTL attribute for the 24-hour expiry). The throttle gate for reports needs the same treatment, or
  Lambda reserved concurrency as a blunt equivalent.
- **Webhook delivery needs a queue.** Lambda freezes the execution environment right after the response is sent, so
  the `asyncio` background tasks that deliver and retry webhooks may be paused mid-retry or never run. On AWS,
  publish events to **Amazon SQS** from the API and let a **worker Lambda** consume the queue; SQS visibility
  timeouts and a dead-letter queue replace the in-process retry loop (delays can still follow the same
  exponential-backoff-with-jitter formula), and the delivery log goes in DynamoDB.
- **Demo clients to a real identity provider.** Replace `/oauth/token` and the client registry with **Amazon
  Cognito** (a user pool with a resource server and client-credentials app clients) or another OIDC provider, and
  verify its RS256 tokens against the JWKS, or let the API Gateway JWT authorizer do it before Lambda runs.
- **Edge and operations.** Put **AWS WAF** and a CloudFront distribution in front for abuse protection, keep the
  secret in **Secrets Manager** if you need rotation, and alarm on 5xx and throttle metrics in **CloudWatch**
  (detailed route metrics are enabled in the template).

## Interpretations of the spec

- A wrong method on a known path answers 405 with a `method-not-allowed` problem (not in the spec's slug table).
- The `invalid-state` slug exists in the catalog but no endpoint raises it (paying twice is a 200 no-op).
- Authentication runs before request-body validation, so an unauthenticated request with a bad body gets 401.
- A webhook delivery that succeeds after failures clears `lastError` and shows the last attempt's status code.
