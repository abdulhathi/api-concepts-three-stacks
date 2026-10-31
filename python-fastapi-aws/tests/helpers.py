"""Test harness: an in-process app plus an httpx client wired to it (no sockets involved)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import FastAPI
from httpx import ASGITransport

from app.config import Settings
from app.container import Container
from app.main import create_app

TEST_SETTINGS = Settings(webhook_retry_base_ms=5)


class FakeClock:
    """Monotonic clock the tests can move forward (for the token bucket)."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@dataclass
class Stack:
    app: FastAPI
    container: Container
    http: httpx.AsyncClient

    async def token(self, client_id: str, scope: str | None = None) -> str:
        data = {"grant_type": "client_credentials"}
        if scope:
            data["scope"] = scope
        response = await self.http.post(
            "/oauth/token", data=data, auth=(client_id, f"{client_id}-secret")
        )
        assert response.status_code == 200, response.text
        return str(response.json()["access_token"])

    async def auth(self, client_id: str, scope: str | None = None) -> dict[str, str]:
        return {"Authorization": f"Bearer {await self.token(client_id, scope)}"}


@asynccontextmanager
async def running(
    settings: Settings = TEST_SETTINGS, **container_options: Any
) -> AsyncIterator[Stack]:
    container = Container.build(settings, **container_options)
    app = create_app(settings, container)
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield Stack(app, container, http)
