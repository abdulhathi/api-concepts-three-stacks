"""Concept 19 · Caching: strong and weak ETags, If-None-Match and If-Match comparison."""

import hashlib


def strong_etag(resource_id: str, version: int) -> str:
    return f'"{resource_id}-v{version}"'


def weak_etag(body: bytes) -> str:
    return f'W/"{hashlib.sha256(body).hexdigest()[:32]}"'


def _tags(header: str) -> list[str]:
    return [part.strip() for part in header.split(",") if part.strip()]


def _opaque(tag: str) -> str:
    return tag.removeprefix("W/")


def none_match_hit(header: str | None, etag: str) -> bool:
    """`If-None-Match` uses the weak comparison: W/ prefixes are ignored. `*` matches anything."""
    if header is None:
        return False
    return any(t == "*" or _opaque(t) == _opaque(etag) for t in _tags(header))


def if_match_ok(header: str | None, etag: str) -> bool:
    """`If-Match` uses the strong comparison. A missing header means no precondition."""
    if header is None:
        return True
    return any(t == "*" or t == etag for t in _tags(header))
