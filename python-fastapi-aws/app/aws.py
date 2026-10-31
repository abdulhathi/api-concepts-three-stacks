"""AWS glue: read the JWT secret from SSM Parameter Store when running on Lambda."""

import os
from dataclasses import replace

from app.config import Settings


def load_settings() -> Settings:
    """Environment settings, with `JWT_SECRET` replaced by the SecureString named in
    `JWT_SECRET_PARAMETER` (resolved once per cold start, never logged)."""
    settings = Settings.from_env()
    parameter = os.environ.get("JWT_SECRET_PARAMETER")
    if not parameter:
        return settings

    import boto3  # type: ignore[import-untyped]  # bundled with the Lambda runtime, so it is not in requirements.txt

    ssm = boto3.client("ssm")
    value = ssm.get_parameter(Name=parameter, WithDecryption=True)["Parameter"]["Value"]
    return replace(settings, jwt_secret=value)
