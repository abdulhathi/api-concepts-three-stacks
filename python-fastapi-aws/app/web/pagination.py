"""Concept 18 · Pagination: opaque keyset cursors, `page` object and `Link: rel="next"`."""

import base64
import binascii
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol
from urllib.parse import urlencode

from app.timefmt import format_timestamp
from app.web.problems import Problem


class Keyed(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def created_at(self) -> datetime: ...


@dataclass(frozen=True, slots=True)
class Cursor:
    """Position of the last item already returned; the next page starts strictly after it."""

    created_at: datetime
    id: str

    def sort_key(self) -> tuple[datetime, str]:
        return (self.created_at, self.id)


def encode_cursor(cursor: Cursor) -> str:
    payload = json.dumps({"t": format_timestamp(cursor.created_at), "i": cursor.id})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(token: str) -> Cursor:
    try:
        padded = token + "=" * (-len(token) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
        created_at = datetime.fromisoformat(data["t"])
        if created_at.tzinfo is None or not isinstance(data["i"], str):
            raise ValueError("incomplete cursor")
        return Cursor(created_at, data["i"])
    except (ValueError, KeyError, TypeError, binascii.Error) as exc:
        raise Problem("invalid-cursor", "The cursor cannot be decoded.") from exc


@dataclass(frozen=True, slots=True)
class Page[T: Keyed]:
    items: list[T]
    limit: int
    next_cursor: str | None

    @property
    def has_more(self) -> bool:
        return self.next_cursor is not None


def make_page[T: Keyed](rows: Sequence[T], limit: int) -> Page[T]:
    """`rows` holds up to `limit + 1` items; the extra one only proves there is a next page."""
    items = list(rows[:limit])
    more = len(rows) > limit
    next_cursor = encode_cursor(Cursor(items[-1].created_at, items[-1].id)) if more else None
    return Page(items, limit, next_cursor)


def page_body[T: Keyed](page: Page[T], render: Callable[[T], dict[str, Any]]) -> dict[str, Any]:
    return {
        "data": [render(item) for item in page.items],
        "page": {"limit": page.limit, "nextCursor": page.next_cursor, "hasMore": page.has_more},
    }


def next_link(path: str, page: Page[Any], **extra: str | None) -> dict[str, str]:
    """Headers dict containing `Link` when there is a next page, empty otherwise."""
    if page.next_cursor is None:
        return {}
    params = [("limit", str(page.limit)), ("cursor", page.next_cursor)]
    params += [(k, v) for k, v in extra.items() if v is not None]
    return {"Link": f'<{path}?{urlencode(params)}>; rel="next"'}
