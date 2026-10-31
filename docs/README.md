# Concept guides

Read them in order: each one builds on the ones before. Every guide has the same parts: what it is, why it matters,
how it works, the rule this repo follows, the real code from all three stacks side by side, curl commands to try it,
the cloud counterpart, common mistakes and interview questions.

## Part 1 · The shape of an API call

1. [Requests and responses](concepts/01-requests-and-responses.md)
2. [Endpoints](concepts/02-endpoints.md)
3. [HTTP methods](concepts/03-http-methods.md)
4. [Headers](concepts/04-headers.md)
5. [Path and query parameters](concepts/05-path-and-query-parameters.md)
6. [Request bodies](concepts/06-request-bodies.md)
7. [JSON and serialization](concepts/07-json-and-serialization.md)
8. [API schemas](concepts/08-api-schemas.md)
9. [Status codes](concepts/09-status-codes.md)

## Part 2 · Who may call it

10. [Authentication](concepts/10-authentication.md)
11. [Authorization](concepts/11-authorization.md)
12. [Access tokens and JWT](concepts/12-access-tokens-and-jwt.md)
13. [OAuth 2.0](concepts/13-oauth2.md)
14. [HTTPS](concepts/14-https.md)
15. [CORS](concepts/15-cors.md)

## Part 3 · API styles and moving data

16. [REST](concepts/16-rest.md)
17. [GraphQL](concepts/17-graphql.md)
18. [Pagination](concepts/18-pagination.md)
19. [Caching](concepts/19-caching.md)

## Part 4 · Staying up under load and failure

20. [Rate limiting](concepts/20-rate-limiting.md)
21. [Throttling](concepts/21-throttling.md)
22. [Idempotency](concepts/22-idempotency.md)
23. [Retries](concepts/23-retries.md)
24. [Timeouts](concepts/24-timeouts.md)
25. [Exponential backoff](concepts/25-exponential-backoff.md)

## Part 5 · Talking back, and failing well

26. [Webhooks](concepts/26-webhooks.md)
27. [Error handling](concepts/27-error-handling.md)

## A practice loop for each concept

1. Read the guide.
2. Run one stack and try the curl commands.
3. Open the same concept in the other two stacks' `CONCEPTS.md` and compare how each framework solves it.
4. Break it on purpose (remove the check, change a header) and watch the contract test for that concept fail:
   `cd contract-tests && ./run.sh node -t "20 ·"`.
