"""Application factory: wires settings, container, middleware, error handlers and routers."""

import logging
import sys

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.auth import oauth
from app.config import Settings
from app.container import Container
from app.routes import demo, echo, graphql, orders, products, reports, system, webhooks
from app.web.docs import install_openapi
from app.web.errors import install_error_handlers
from app.web.middleware import CrashGuard, RequestContext

DESCRIPTION = """
One HTTP contract for 27 API concepts. Get a token from `POST /oauth/token`
(demo client `reader` / `reader-secret`), click **Authorize**, and try the endpoints.
"""

# Concept 15 · CORS: allowlist, no credentials, headers a browser client may read or send.
CORS_ALLOWED_HEADERS = [
    "Authorization",
    "Content-Type",
    "Idempotency-Key",
    "If-Match",
    "If-None-Match",
    "X-Request-Id",
]
CORS_EXPOSED_HEADERS = [
    "ETag",
    "Link",
    "Location",
    "Retry-After",
    "RateLimit-Limit",
    "RateLimit-Remaining",
    "RateLimit-Reset",
    "X-Request-Id",
    "Idempotent-Replayed",
]


def configure_logging() -> None:
    """Access log lines are already JSON; print them bare, one per line, on stdout."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    access = logging.getLogger("api.access")
    access.handlers = [handler]
    access.setLevel(logging.INFO)
    access.propagate = False
    logging.getLogger("api.error").setLevel(logging.ERROR)


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(
        title="Bookshop API",
        version="1.0.0",
        description=DESCRIPTION,
        docs_url="/docs",
        openapi_url="/openapi.json",
        redoc_url=None,
        redirect_slashes=False,
    )
    app.state.container = container or Container.build(settings)

    install_error_handlers(app)
    for router in (
        system.router, oauth.router, echo.router, products.router, orders.router,
        reports.router, demo.router, webhooks.router, graphql.router,
    ):  # fmt: skip
        app.include_router(router)
    install_openapi(app)

    # add_middleware puts the newest layer outermost: RequestContext > CORS > CrashGuard > routes.
    app.add_middleware(CrashGuard)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=CORS_ALLOWED_HEADERS,
        expose_headers=CORS_EXPOSED_HEADERS,
        allow_credentials=False,
        max_age=600,
    )
    app.add_middleware(RequestContext)
    return app
