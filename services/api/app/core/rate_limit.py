"""Per-process fixed-window API throttling; never trust client-supplied IP headers."""

import asyncio
import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class RateLimiter:
    def __init__(self) -> None:
        self._counts: dict[tuple[str, str, int], int] = {}
        self._lock = asyncio.Lock()

    async def allow(self, ip: str, bucket: str, limit: int, now: float | None = None) -> bool:
        moment = time.monotonic() if now is None else now
        window = int(moment // 60)
        key = (ip, bucket, window)
        async with self._lock:
            if len(self._counts) > 10_000:
                self._counts = {
                    item: count for item, count in self._counts.items() if item[2] >= window - 1
                }
            count = self._counts.get(key, 0) + 1
            self._counts[key] = count
            return count <= limit


def bucket_for(path: str) -> tuple[str, int] | None:
    if path in ("/api/v1/health", "/health"):
        return None
    if path in ("/api/v1/auth/challenge", "/api/v1/auth/verify"):
        return path, 10
    if path.startswith("/api/v1/vouchers/scan"):
        return "voucher-scan", 30
    if path.startswith("/api/v1/"):
        return "api", 120
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: object) -> None:
        super().__init__(app)
        self.limiter = RateLimiter()

    async def dispatch(self, request: Request, call_next):
        bucket = bucket_for(request.url.path)
        if bucket is not None:
            ip = request.client.host if request.client else "unknown"
            if not await self.limiter.allow(ip, bucket[0], bucket[1]):
                return JSONResponse(
                    {"detail": "Rate limit exceeded; try again shortly"},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )
        return await call_next(request)
