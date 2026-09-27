import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.dependencies import AdminUserDep, SessionDep
from app.models.entities import AuditLog, Merchant, User, UserRole, VerificationStatus
from app.schemas.audit import AuditEventRead
from app.schemas.merchants import MerchantDecision, MerchantRead

router = APIRouter(prefix="/admin", tags=["admin"])
VerificationQuery = Annotated[VerificationStatus | None, Query(alias="status")]


@router.get("/audit", response_model=list[AuditEventRead])
async def list_audit_events(
    session: SessionDep,
    _: AdminUserDep,
    suspicious_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[AuditEventRead]:
    query = (
        select(AuditLog, User.wallet_address)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    if suspicious_only:
        query = query.where(AuditLog.action.like("security.%"))
    result = await session.execute(query)
    return [
        AuditEventRead(
            id=event.id,
            action=event.action,
            actor_wallet=wallet,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            created_at=event.created_at,
        )
        for event, wallet in result.all()
    ]


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
