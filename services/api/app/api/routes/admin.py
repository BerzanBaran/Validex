import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.dependencies import AdminUserDep, SessionDep
from app.models.entities import AuditLog, Merchant, User, UserRole, VerificationStatus
from app.schemas.merchants import MerchantDecision, MerchantRead

router = APIRouter(prefix="/admin", tags=["admin"])
VerificationQuery = Annotated[VerificationStatus | None, Query(alias="status")]


@router.get("/merchants", response_model=list[MerchantRead])
async def list_merchant_applications(
    session: SessionDep,
    _: AdminUserDep,
    verification_status: VerificationQuery = VerificationStatus.PENDING,
) -> list[Merchant]:
    query = select(Merchant).order_by(Merchant.created_at.asc())
    if verification_status is not None:
        query = query.where(Merchant.verification_status == verification_status)
    return list(await session.scalars(query))


@router.post("/merchants/{merchant_id}/decision", response_model=MerchantRead)
async def decide_merchant_application(
    merchant_id: uuid.UUID,
    payload: MerchantDecision,
    session: SessionDep,
    admin: AdminUserDep,
) -> Merchant:
    merchant = await session.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant not found")
    if merchant.verification_status != VerificationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Merchant application was already decided",
        )
    owner = await session.get(User, merchant.owner_user_id)
    if owner is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Merchant owner not found")

    merchant.verification_status = (
        VerificationStatus.VERIFIED if payload.approved else VerificationStatus.REJECTED
    )
    if payload.approved:
        owner.role = UserRole.MERCHANT
    session.add(
        AuditLog(
            actor_id=admin.id,
            action=(
                "merchant.application_approved"
                if payload.approved
                else "merchant.application_rejected"
            ),
            entity_type="merchant",
            entity_id=str(merchant.id),
        )
    )
    await session.commit()
    await session.refresh(merchant)
    return merchant
