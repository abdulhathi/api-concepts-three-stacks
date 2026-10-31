"""Concept 7 · JSON and serialization: camelCase on the wire, snake_case in Python."""

from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel

from app.timefmt import format_timestamp

UtcTimestamp = Annotated[datetime, PlainSerializer(format_timestamp, return_type=str)]


class ApiModel(BaseModel):
    # Unknown request properties are ignored (spec); output always uses the camelCase alias.
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True, extra="ignore"
    )

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json", by_alias=True)
