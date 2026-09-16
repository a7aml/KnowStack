"""Rate limiting for auth, invite, chat, document, and org-management
endpoints.

Storage is Redis-backed for both limiters below (slowapi's Redis storage
backend, and the hand-rolled per-key window limiter), using the same
REDIS_URL already configured for Celery. That means limits are shared
across every backend process/instance rather than being per-process and
reset on restart.
"""

import time
import uuid

import redis
from fastapi import HTTPException, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from config.settings import settings

RATE_LIMIT_MESSAGE = "Too many attempts, try again later."

# Per-IP limits, applied via @limiter.limit(...) decorators on routes.
# storage_uri points slowapi (via the `limits` library's RedisStorage) at
# the same Redis instance used as the Celery broker/result backend, so
# limits are shared across every backend process instead of kept in memory
# per-process.
limiter = Limiter(key_func=get_remote_address, storage_uri=settings.redis_url)

_redis_client = redis.from_url(settings.redis_url, decode_responses=True)

# Atomically: drop hits older than the window, count what's left, and only
# record the new hit if that leaves room under max_attempts. Done as one
# Lua script (server-side, single round trip) so concurrent requests
# landing on different backend processes can't race past each other
# between the count and the increment.
_WINDOW_CHECK_SCRIPT = _redis_client.register_script(
    """
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_seconds = tonumber(ARGV[2])
    local max_attempts = tonumber(ARGV[3])
    local member = ARGV[4]

    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_seconds)
    local count = redis.call('ZCARD', key)
    if count >= max_attempts then
        return 1
    end
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window_seconds)
    return 0
    """
)


class RedisWindowLimiter:
    """Fixed-key sliding-window counter for limits slowapi's IP-only
    key_func can't express — e.g. "5 login attempts per email per 15
    minutes", or per-user/per-org budgets layered on top of the per-IP
    limit.

    slowapi's key_func is called synchronously with just the Request, so it
    can't await request.json() to read a field like `email` out of the
    body, or a resolved user/org id. This is a small, self-contained
    stand-in for that one dimension — backed by a Redis sorted set per key
    (via the shared REDIS_URL) so the window is enforced consistently no
    matter which backend process handles a given request.
    """

    def check(self, key: str, *, max_attempts: int, window_seconds: int) -> None:
        redis_key = f"ratelimit:{key}"
        exceeded = _WINDOW_CHECK_SCRIPT(
            keys=[redis_key],
            args=[time.time(), window_seconds, max_attempts, uuid.uuid4().hex],
        )
        if exceeded:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=RATE_LIMIT_MESSAGE,
            )


login_email_limiter = RedisWindowLimiter()
