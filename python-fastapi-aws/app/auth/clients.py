"""Concept 13 · OAuth 2.0: the demo client registry (dev only; use a real identity provider)."""

import hmac
from dataclasses import dataclass

PLAN_LIMITS_PER_MINUTE = {"free": 5, "standard": 1000}


@dataclass(frozen=True, slots=True)
class OAuthClient:
    client_id: str
    client_secret: str
    scopes: tuple[str, ...]
    plan: str

    def secret_matches(self, candidate: str) -> bool:
        return hmac.compare_digest(self.client_secret.encode(), candidate.encode())


_READ = ("products:read", "orders:read")
_WRITE = ("products:read", "products:write", "orders:read", "orders:write")

DEMO_CLIENTS: dict[str, OAuthClient] = {
    c.client_id: c
    for c in (
        OAuthClient("reader", "reader-secret", _READ, "standard"),
        OAuthClient("writer", "writer-secret", _WRITE, "standard"),
        OAuthClient("partner", "partner-secret", _WRITE, "standard"),
        OAuthClient("admin", "admin-secret", (*_WRITE, "admin"), "standard"),
        OAuthClient("free", "free-secret", ("products:read",), "free"),
    )
}
