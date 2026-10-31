# AWS infrastructure (SAM)

`template.yaml` describes everything the API needs on AWS:

| Resource | Why |
|---|---|
| `ApiFunction` (Lambda, `python3.13`, arm64) | Runs the FastAPI app through Mangum (`app.lambda_handler.handler`). |
| `HttpApi` (API Gateway HTTP API) | Public HTTPS endpoint; terminates TLS and sends `X-Forwarded-Proto: https`, which turns on HSTS in the app. |
| `DefaultRouteSettings` throttling | Concept 21 in the cloud: `ThrottlingRateLimit` (steady requests per second) and `ThrottlingBurstLimit` (bucket size). Requests over the limit get a 429 from API Gateway before Lambda is invoked or billed. |
| SSM SecureString + `SSMParameterReadPolicy` | The JWT signing key is never in the template or the environment; the function reads it once per cold start. |
| Two `AWS::Logs::LogGroup`s | Function logs (one JSON line per request) and API Gateway access logs, both with `RetentionInDays`. |

The gateway limit and the app limits stack: API Gateway protects the function from floods (per stage), the app's
token bucket enforces the per-client plan (concept 20), and the app's concurrency gate protects the slow report
endpoint (concept 21). The gateway's own 429 is not a problem+json body; clients should treat it like any other 429
and honour `Retry-After` when present.

Build and deploy commands are in the stack [README](../../README.md#deploy-to-aws). `sam build` uses the
[Makefile](../../Makefile) in the stack root so that the wheels in the package match Lambda's Linux arm64 runtime
even when you build on a Mac.
