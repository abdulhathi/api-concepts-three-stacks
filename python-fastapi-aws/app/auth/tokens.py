"""Concept 12 · Access tokens and JWT: HS256 tokens with iss, aud, sub, scope, iat, exp, jti."""

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

from app.auth.clients import OAuthClient


class TokenError(Exception):
    """The token is missing a claim, expired, forged or meant for someone else."""


@dataclass(frozen=True, slots=True)
class Principal:
    """The authenticated caller, rebuilt from a verified token."""

    client_id: str
    scopes: tuple[str, ...]
    plan: str
    expires_at: datetime

    @property
    def is_admin(self) -> bool:
        return "admin" in self.scopes


class TokenService:
    ALGORITHM = "HS256"

    def __init__(
        self,
        *,
        secret: str,
        issuer: str,
        audience: str,
        ttl_seconds: int,
        clients: Mapping[str, OAuthClient],
        now: Callable[[], datetime],
    ) -> None:
        self._secret = secret
        self._issuer = issuer
        self._audience = audience
        self.ttl_seconds = ttl_seconds
        self._clients = clients
        self._now = now

    def issue(self, client: OAuthClient, scopes: list[str]) -> str:
        issued_at = self._now()
        claims = {
            "iss": self._issuer,
            "aud": self._audience,
            "sub": client.client_id,
            "scope": " ".join(scopes),
            "iat": int(issued_at.timestamp()),
            "exp": int((issued_at + timedelta(seconds=self.ttl_seconds)).timestamp()),
            "jti": str(uuid.uuid4()),
        }
        return jwt.encode(claims, self._secret, algorithm=self.ALGORITHM, headers={"typ": "JWT"})

    def verify(self, token: str) -> Principal:
        try:
            # Pinning `algorithms` blocks the classic "alg: none" and algorithm-confusion attacks.
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[self.ALGORITHM],
                audience=self._audience,
                issuer=self._issuer,
                leeway=0,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
        except jwt.InvalidTokenError as exc:
            raise TokenError(f"The access token is not valid ({type(exc).__name__}).") from exc

        client = self._clients.get(claims["sub"])
        if client is None:
            raise TokenError("The access token belongs to an unknown client.")
        return Principal(
            client_id=client.client_id,
            scopes=tuple(str(claims.get("scope", "")).split()),
            plan=client.plan,
            expires_at=datetime.fromtimestamp(claims["exp"], tz=UTC),
        )
