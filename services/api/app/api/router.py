from fastapi import APIRouter

from app.api.routes import admin, auth, campaigns, health, merchants, vouchers

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(campaigns.router)
api_router.include_router(merchants.router)
api_router.include_router(admin.router)
api_router.include_router(vouchers.router)
