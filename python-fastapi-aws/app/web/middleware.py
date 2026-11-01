"""Cross-cutting HTTP behaviour as pure ASGI middleware.

Concept 1 · Requests and responses: one structured JSON log line per request.
Concept 4 · Headers: X-Request-Id on every response, security headers.
Concept 14 · HTTPS: HSTS only when the request arrived over TLS (directly or via the edge proxy).
Concept 19 · Caching: `Cache-Control: no-store` unless the handler chose something else.
"""

import json
import logging
import re
import time
import uuid
from collections.abc import MutableMapping
from typing import Any

from fastapi import Request
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.timefmt import format_timestamp, utc_now
from app.web.problems import Problem, problem_response

access_log = logging.getLogger("api.access")
error_log = logging.getLogger("api.error")

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_NO_STORE_PREFIXES = ("/v1", "/graphql", "/oauth")
_HSTS = "max-age=31536000; includeSubDomains"


def _request_id(headers: Headers) -> str:
    supplied = headers.get("x-request-id", "")
    return supplied if _REQUEST_ID.fullmatch(supplied) else str(uuid.uuid4())


def _is_https(scope: Scope, headers: Headers) -> bool:
    # API Gateway terminates TLS and tells the function through X-Forwarded-Proto.
    forwarded = headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    return scope.get("scheme") == "https" or forwarded == "https"


def _wants_no_store(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in _NO_STORE_PREFIXES)


class RequestContext:
    """Outermost layer: request id, response headers, access log. Sees every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        state: MutableMapping[str, Any] = scope.setdefault("state", {})
        headers = Headers(scope=scope)
        state["request_id"] = _request_id(headers)
        https = _is_https(scope, headers)
        path: str = scope["path"]
        started = time.perf_counter()
        status = 500

        async def send_with_context(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                out = MutableHeaders(scope=message)
                out["X-Request-Id"] = state["request_id"]
                out["X-Content-Type-Options"] = "nosniff"
                out["Referrer-Policy"] = "no-referrer"
                if https:
                    out["Strict-Transport-Security"] = _HSTS
                for name, value in state.get("rate_limit_headers", {}).items():
                    out[name] = value
                if "cache-control" not in out and _wants_no_store(path):
                    out["Cache-Control"] = "no-store"
            await send(message)

        try:
            await self.app(scope, receive, send_with_context)
        finally:
            access_log.info(
                json.dumps(
                    {
                        "ts": format_timestamp(utc_now()),
                        "level": "error" if status >= 500 else "info",
                        "requestId": state["request_id"],
                        "method": scope["method"],
                        "path": path,
                        "status": status,
                        "durationMs": round((time.perf_counter() - started) * 1000, 1),
                        "clientId": state.get("client_id"),
                    }
                )
            )


class CrashGuard:
    """Innermost layer: turn an unhandled exception into a generic 500 problem.

    The stack trace goes to the log with the request id; the client only sees a fixed message.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            request = Request(scope)
            # The id is in the message itself, so it shows whatever log format is configured.
            error_log.exception(
                "unhandled exception, requestId=%s",
                request.state.request_id,
                extra={"request_id": request.state.request_id},
            )
            if started:
                raise
            problem = Problem("internal-error", "An unexpected error occurred.")
            await problem_response(request, problem)(scope, receive, send)
