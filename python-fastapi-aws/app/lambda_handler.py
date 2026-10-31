"""AWS Lambda entry point: Mangum translates API Gateway HTTP API events to ASGI and back."""

from mangum import Mangum

from app.aws import load_settings
from app.main import configure_logging, create_app

configure_logging()
# API Gateway HTTP API has no ASGI lifespan, so it is switched off.
handler = Mangum(create_app(load_settings()), lifespan="off")
