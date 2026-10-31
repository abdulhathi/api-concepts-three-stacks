"""Concept 26 · Webhooks: HMAC-SHA256 signing and the receiver-side `verify_signature` helper."""

import hashlib
import hmac
import time
from collections.abc import Callable

TOLERANCE_SECONDS = 300


class InvalidSignature(Exception):
    pass


def sign(secret: str, timestamp: int | str, body: bytes) -> str:
    """`v1=<hex>` over `<timestamp>.<raw body>`, keyed with the whole secret including `whsec_`."""
    message = f"{timestamp}.".encode() + body
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"v1={digest}"


def verify_signature(
    secret: str,
    body: bytes,
    timestamp: str,
    signature: str,
    *,
    now: Callable[[], float] = time.time,
    tolerance: int = TOLERANCE_SECONDS,
) -> None:
    """Receivers call this with the raw body and the Webhook-* headers; raises `InvalidSignature`.

    The timestamp check stops an attacker replaying a captured delivery later, and
    `compare_digest` keeps the comparison constant-time.
    """
    try:
        sent_at = int(timestamp)
    except ValueError as exc:
        raise InvalidSignature("timestamp is not a number") from exc
    if abs(now() - sent_at) > tolerance:
        raise InvalidSignature("timestamp is outside the allowed window")

    expected = sign(secret, timestamp, body)
    if not any(hmac.compare_digest(expected, candidate) for candidate in signature.split()):
        raise InvalidSignature("signature does not match")
