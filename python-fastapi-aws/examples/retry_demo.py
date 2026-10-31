"""Concepts 23 and 25 · Retries with backoff: call the flaky endpoint and print each retry.

python -m examples.retry_demo [base_url]      # needs the API running (default :8001)
"""

import asyncio
import sys
import uuid

from bookshop_client import BookshopClient, RetryEvent


def show(event: RetryEvent) -> None:
    print(f"  attempt {event.retry} failed ({event.reason}); waiting {event.delay_ms:.0f} ms")


async def main(base_url: str) -> None:
    key = f"demo-{uuid.uuid4()}"
    print(f"GET /v1/demo/flaky?key={key}&failTimes=2")
    async with BookshopClient(base_url, "reader", "reader-secret", on_retry=show) as client:
        result = await client.flaky(key, fail_times=2)
    print(f"succeeded on call {result['attempts']}: {result}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001"))
