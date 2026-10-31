"""Concept 7 · JSON and serialization: RFC 3339 UTC timestamps with millisecond precision."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    return datetime.now(UTC)


def format_timestamp(value: datetime) -> str:
    """`2026-01-01T00:00:00.000Z`, always UTC, always three fractional digits."""
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
