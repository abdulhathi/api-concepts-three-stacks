"""Settings from environment variables (same names in every stack of this repo)."""

import os
from collections.abc import Mapping
from dataclasses import dataclass

DEFAULT_JWT_SECRET = "dev-only-secret-change-me-0123456789abcdef"


@dataclass(frozen=True, slots=True)
class Settings:
    port: int = 8001
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_issuer: str = "api-concepts"
    jwt_audience: str = "api-concepts-clients"
    token_ttl_seconds: int = 900
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)
    request_timeout_ms: int = 2000
    webhook_retry_base_ms: int = 500
    webhook_max_attempts: int = 5

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        defaults = cls()
        origins = env.get("CORS_ORIGINS")
        return cls(
            port=int(env.get("PORT", defaults.port)),
            jwt_secret=env.get("JWT_SECRET", defaults.jwt_secret),
            jwt_issuer=env.get("JWT_ISSUER", defaults.jwt_issuer),
            jwt_audience=env.get("JWT_AUDIENCE", defaults.jwt_audience),
            token_ttl_seconds=int(env.get("TOKEN_TTL_SECONDS", defaults.token_ttl_seconds)),
            cors_origins=(
                tuple(o.strip() for o in origins.split(",") if o.strip())
                if origins is not None
                else defaults.cors_origins
            ),
            request_timeout_ms=int(env.get("REQUEST_TIMEOUT_MS", defaults.request_timeout_ms)),
            webhook_retry_base_ms=int(
                env.get("WEBHOOK_RETRY_BASE_MS", defaults.webhook_retry_base_ms)
            ),
            webhook_max_attempts=int(
                env.get("WEBHOOK_MAX_ATTEMPTS", defaults.webhook_max_attempts)
            ),
        )
