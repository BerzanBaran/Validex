from fastapi import APIRouter

from app.api.routes import campaigns, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(campaigns.router)

