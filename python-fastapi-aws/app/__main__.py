"""`python -m app` runs the API locally on $PORT (default 8001)."""

import os

import uvicorn

from app.config import Settings
from app.main import configure_logging, create_app


def main() -> None:
    settings = Settings.from_env()
    configure_logging()
    # Uvicorn's own access log is off: the app writes the structured log line itself.
    uvicorn.run(
        create_app(settings),
        host=os.environ.get("HOST", "127.0.0.1"),
        port=settings.port,
        access_log=False,
    )


if __name__ == "__main__":
    main()
