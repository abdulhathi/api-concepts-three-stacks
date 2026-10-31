"""Concept 27 · Error handling: failures surface as one typed exception carrying the problem."""

from bookshop_client.types import Problem


class ApiError(Exception):
    """The client gave up. `problem` is the server's RFC 9457 body when there was one."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        problem: Problem | None = None,
        attempts: int = 1,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.problem = problem
        self.attempts = attempts

    @property
    def slug(self) -> str | None:
        """`rate-limited`, `not-found`, ... from the problem's `type`, if any."""
        return self.problem["type"].rsplit("/", 1)[-1] if self.problem else None
