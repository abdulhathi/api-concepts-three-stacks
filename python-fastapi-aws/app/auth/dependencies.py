"""Concepts 10 and 11 · Authentication (401) and authorization (403), then rate limiting (20).

One dependency does all three in the order the contract needs: a rejected token is never
counted against the bucket, and a missing scope still consumes a token.
"""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.tokens import Principal, TokenError
from app.container import container_of
from app.web.problems import Problem

REALM = 'Bearer realm="api-concepts"'

# Makes Swagger UI show the "Authorize" button; auto_error=False so we can raise our own 401.
bearer_scheme = HTTPBearer(
    auto_error=False,
    bearerFormat="JWT",
    scheme_name="bearerAuth",
    description="Access token from POST /oauth/token",
)


def require(scope: str | None = None) -> Callable[..., Awaitable[Principal]]:
    """Dependency factory: any valid token, or one that carries `scope`."""

    async def authenticate(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    ) -> Principal:
        container = container_of(request)
        if credentials is None:
            raise Problem(
                "unauthorized",
                "Send an access token as 'Authorization: Bearer <token>'.",
                headers={"WWW-Authenticate": REALM},
            )
        try:
            principal = container.tokens.verify(credentials.credentials)
        except TokenError as exc:
            # The client learns only that the token was rejected, never which check failed.
            raise Problem(
                "unauthorized",
                "The access token is missing, expired or invalid.",
                headers={"WWW-Authenticate": f'{REALM}, error="invalid_token"'},
            ) from exc

        request.state.client_id = principal.client_id
        decision = container.limiter.check(principal.client_id, principal.plan)
        request.state.rate_limit_headers = decision.headers()
        if not decision.allowed:
            raise Problem(
                "rate-limited",
                f"Rate limit of {decision.limit} requests per minute exceeded.",
                headers={"Retry-After": str(decision.retry_after)},
            )

        if scope is not None and scope not in principal.scopes:
            raise Problem(
                "forbidden",
                f"This operation needs the '{scope}' scope.",
                headers={
                    "WWW-Authenticate": f'{REALM}, error="insufficient_scope", scope="{scope}"'
                },
            )
        return principal

    return authenticate
