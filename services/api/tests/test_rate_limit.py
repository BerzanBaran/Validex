import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit import RateLimiter, RateLimitMiddleware, bucket_for


def test_sensitive_routes_have_smaller_buckets() -> None:
    assert bucket_for("/api/v1/auth/challenge") == ("/api/v1/auth/challenge", 10)
    assert bucket_for("/api/v1/vouchers/scan") == ("voucher-scan", 30)
    assert bucket_for("/api/v1/health") is None


def test_limit_is_per_ip_and_resets_next_window() -> None:
    async def exercise() -> None:
        limiter = RateLimiter()
        assert await limiter.allow("ip-one", "auth", 2, now=1)
        assert await limiter.allow("ip-one", "auth", 2, now=2)
        assert not await limiter.allow("ip-one", "auth", 2, now=3)
        assert await limiter.allow("ip-two", "auth", 2, now=3)
        assert await limiter.allow("ip-one", "auth", 2, now=61)

    asyncio.run(exercise())


def test_http_limit_returns_429_and_retry_after() -> None:
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)

    @app.post("/api/v1/auth/challenge")
    def challenge() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(app) as client:
        for _ in range(10):
            assert client.post("/api/v1/auth/challenge").status_code == 200
        blocked = client.post("/api/v1/auth/challenge")
        assert blocked.status_code == 429
        assert blocked.headers["Retry-After"] == "60"
