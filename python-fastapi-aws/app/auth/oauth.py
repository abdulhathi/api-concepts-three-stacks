"""Concept 13 · OAuth 2.0: client credentials grant at POST /oauth/token (RFC 6749)."""

import base64
import binascii
from urllib.parse import parse_qs, unquote_plus

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth.clients import OAuthClient
from app.container import container_of

router = APIRouter(tags=["OAuth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    scope: str


class OAuthError(BaseModel):
    error: str
    error_description: str


def _oauth_error(
    code: str, description: str, status: int, *, challenge: bool = False
) -> JSONResponse:
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    if challenge:
        headers["WWW-Authenticate"] = 'Basic realm="api-concepts"'
    return JSONResponse(
        {"error": code, "error_description": description}, status_code=status, headers=headers
    )


def _basic_credentials(header: str | None) -> tuple[str, str] | None:
    if not header or not header.lower().startswith("basic "):
        return None
    try:
        decoded = base64.b64decode(header[6:].strip(), validate=True).decode()
    except (binascii.Error, UnicodeDecodeError):
        return None
    client_id, separator, secret = decoded.partition(":")
    # RFC 6749 section 2.3.1: both parts are form-urlencoded before Base64.
    return (unquote_plus(client_id), unquote_plus(secret)) if separator else None


def _authenticate(request: Request, form: dict[str, str]) -> OAuthClient | None:
    """client_secret_basic first, then client_secret_post."""
    credentials = _basic_credentials(request.headers.get("authorization"))
    if credentials is None and "client_id" in form:
        credentials = (form["client_id"], form.get("client_secret", ""))
    if credentials is None:
        return None
    client = container_of(request).clients.get(credentials[0])
    return client if client and client.secret_matches(credentials[1]) else None


@router.post(
    "/oauth/token",
    response_model=TokenResponse,
    responses={400: {"model": OAuthError}, 401: {"model": OAuthError}},
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/x-www-form-urlencoded": {
                    "schema": {
                        "type": "object",
                        "required": ["grant_type"],
                        "properties": {
                            "grant_type": {"type": "string", "enum": ["client_credentials"]},
                            "scope": {"type": "string"},
                            "client_id": {"type": "string"},
                            "client_secret": {"type": "string"},
                        },
                    }
                }
            },
        }
    },
)
async def token(request: Request) -> JSONResponse:
    """Exchange client credentials for a short-lived JWT access token."""
    form = {k: v[0] for k, v in parse_qs((await request.body()).decode(errors="replace")).items()}

    client = _authenticate(request, form)
    if client is None:
        return _oauth_error("invalid_client", "Client authentication failed.", 401, challenge=True)

    grant_type = form.get("grant_type")
    if grant_type is None:
        return _oauth_error("invalid_request", "grant_type is required.", 400)
    if grant_type != "client_credentials":
        return _oauth_error("unsupported_grant_type", "Only client_credentials is supported.", 400)

    requested = form.get("scope", "").split()
    granted = requested or list(client.scopes)
    missing = [s for s in granted if s not in client.scopes]
    if missing:
        return _oauth_error("invalid_scope", f"Scope not allowed: {' '.join(missing)}.", 400)

    tokens = container_of(request).tokens
    return JSONResponse(
        {
            "access_token": tokens.issue(client, granted),
            "token_type": "Bearer",
            "expires_in": tokens.ttl_seconds,
            "scope": " ".join(granted),
        },
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )
