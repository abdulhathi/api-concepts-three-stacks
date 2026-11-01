"""Concept 7 · JSON and serialization: camelCase on the wire, snake_case in Python."""

from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel

from app.timefmt import format_timestamp

UtcTimestamp = Annotated[datetime, PlainSerializer(format_timestamp, return_type=str)]


class ApiModel(BaseModel):
    # Unknown request properties are ignored (spec); output always uses the camelCase alias.
    # Code may build models by their snake_case names.
    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
        extra="ignore",
    )

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json", by_alias=True)


class ApiInput(ApiModel):
    # A request body accepts only the camelCase names: "price_cents" is an unknown property,
    # so it is ignored.
    model_config = ConfigDict(validate_by_name=False)
