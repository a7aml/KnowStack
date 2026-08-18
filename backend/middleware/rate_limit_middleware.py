"""Rate limiting for auth endpoints.

Storage is in-memory for both limiters below (slowapi's default storage, and
the hand-rolled per-email limiter). That means limits are per-process and
reset on restart, and are NOT shared across multiple workers/instances.
Before running more than one backend process, switch to a shared backend —
e.g. `Limiter(key_func=..., storage_uri="redis://...")` for slowapi, and a
Redis sorted-set (or similar) in place of InMemoryWindowLimiter below.
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, status
from slowapi import Limiter
from slowapi.util import get_remote_address

RATE_LIMIT_MESSAGE = "Too many attempts, try again later."

# Per-IP limits, applied via @limiter.limit(...) decorators on routes.
limiter = Limiter(key_func=get_remote_address)


class InMemoryWindowLimiter:
    """Fixed-key sliding-window counter for limits slowapi's IP-only key_func
    can't express — e.g. "5 login attempts per email per 15 minutes".

    slowapi's key_func is called synchronously with just the Request, so it
    can't await request.json() to read a field like `email` out of the body.
    This is a small, self-contained stand-in for that one dimension.
    """

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str, *, max_attempts: int, window_seconds: int) -> None:
        now = time.monotonic()
        with self._lock:
            hits = [t for t in self._hits[key] if now - t < window_seconds]
            if len(hits) >= max_attempts:
                self._hits[key] = hits
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=RATE_LIMIT_MESSAGE,
                )
            hits.append(now)
            self._hits[key] = hits


login_email_limiter = InMemoryWindowLimiter()
