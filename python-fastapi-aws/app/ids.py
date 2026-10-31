"""Prefixed random ids such as `prd_3f9a0c12bb41` (12 lowercase hex characters)."""

import secrets


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"
