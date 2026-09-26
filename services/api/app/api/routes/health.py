from fastapi import APIRouter

router = APIRouter(tags=["system"])


@router.get("/health", summary="Service liveness")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "validex-api"}

