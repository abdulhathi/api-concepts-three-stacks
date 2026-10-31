from collections.abc import AsyncIterator

import pytest

from tests.helpers import Stack, running


@pytest.fixture
async def stack() -> AsyncIterator[Stack]:
    async with running() as s:
        yield s
