import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import CurrentUserDep, SessionDep
from app.models.entities import AuditLog, Merchant
from app.schemas.merchants import MerchantCreate, MerchantRead

router = APIRouter(prefix="/merchants", tags=["merchants"])


@router.post("", response_model=MerchantRead, status_code=status.HTTP_201_CREATED)
async def apply_as_merchant(
    payload: MerchantCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Merchant:
    existing = await session.scalar(
        select(Merchant).where(Merchant.owner_user_id == current_user.id)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A merchant application already exists for this wallet",
        )
    merchant = Merchant(
        owner_user_id=current_user.id,
        wallet_address=current_user.wallet_address,
        **payload.model_dump(),
    )
    session.add(merchant)
    await session.flush()
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="merchant.application_created",
            entity_type="merchant",
            entity_id=str(merchant.id),
        )
    )
    await session.commit()
    await session.refresh(merchant)
    return merchant


@router.get("/me", response_model=MerchantRead)
async def get_my_merchant(
    session: SessionDep,
    current_user: CurrentUserDep,
) -> Merchant:
    merchant = await session.scalar(
        select(Merchant).where(Merchant.owner_user_id == current_user.id)
    )
    if merchant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Merchant application not found",
        )
    return merchant


@router.get("/{merchant_id}", response_model=MerchantRead)
async def get_merchant(merchant_id: uuid.UUID, session: SessionDep) -> Merchant:
    merchant = await session.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant not found")
    return merchant
