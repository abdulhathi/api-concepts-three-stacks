"""Concept 6 · Request bodies: product payloads validated by Pydantic constraints."""

from typing import Annotated, Any

from pydantic import AfterValidator, Field, StringConstraints, field_validator

from app.models.base import ApiInput, ApiModel, UtcTimestamp

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Author = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# strict: 12.5 or "12" are rejected instead of being coerced to an integer number of cents.
PriceCents = Annotated[int, Field(strict=True, ge=0, le=10_000_000)]
Tag = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,30}$")]


def _require_unique(tags: list[str]) -> list[str]:
    if len(set(tags)) != len(tags):
        raise ValueError("tags must be unique")
    return tags


Tags = Annotated[list[Tag], Field(max_length=10), AfterValidator(_require_unique)]


class ProductCreate(ApiInput):
    title: Title
    author: Author
    price_cents: PriceCents
    tags: Tags = Field(default_factory=list)


class ProductReplace(ApiInput):
    """PUT is a full replace, so every field is required."""

    title: Title
    author: Author
    price_cents: PriceCents
    tags: Tags


class ProductPatch(ApiInput):
    """PATCH takes any subset; only fields present in the body change."""

    title: Title | None = None
    author: Author | None = None
    price_cents: PriceCents | None = None
    tags: Tags | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _reject_null(cls, value: Any) -> Any:
        # Validators only run for fields the client sent, so an explicit null lands here.
        if value is None:
            raise ValueError("must not be null")
        return value


class Product(ApiModel):
    id: str
    title: str
    author: str
    price_cents: int
    currency: str = "USD"
    tags: list[str]
    version: int
    created_at: UtcTimestamp
    updated_at: UtcTimestamp
