import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUserDep, SessionDep
from app.domain.solana_chain import ChainVerificationError, public_key_bytes
from app.models.entities import (
    AuditLog,
    Campaign,
    CampaignStatus,
    Merchant,
    MerchantStaff,
    VerificationStatus,
)
from app.schemas.merchants import (
    CampaignScanAccess,
    MerchantCreate,
    MerchantRead,
    StaffCampaignRead,
    StaffGrant,
    StaffRead,
)

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


@router.get("/me/staff", response_model=list[StaffRead])
async def list_my_staff(session: SessionDep, current_user: CurrentUserDep) -> list[MerchantStaff]:
    merchant = await session.scalar(
        select(Merchant).where(Merchant.owner_user_id == current_user.id)
    )
    if merchant is None:
        raise HTTPException(status_code=404, detail="Merchant account not found")
    return list(
        await session.scalars(select(MerchantStaff).where(MerchantStaff.merchant_id == merchant.id))
    )


@router.post("/me/staff", response_model=StaffRead)
async def grant_staff(
    payload: StaffGrant, session: SessionDep, current_user: CurrentUserDep
) -> MerchantStaff:
    merchant = await session.scalar(
        select(Merchant).where(Merchant.owner_user_id == current_user.id)
    )
    if merchant is None or merchant.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(status_code=403, detail="Verified merchant owner required")
    try:
        public_key_bytes(payload.wallet_address)
    except ChainVerificationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if payload.wallet_address == current_user.wallet_address:
        raise HTTPException(status_code=409, detail="Owner wallet already has access")
    staff = await session.scalar(
        select(MerchantStaff)
        .where(
            MerchantStaff.merchant_id == merchant.id,
            MerchantStaff.wallet_address == payload.wallet_address,
        )
        .with_for_update()
    )
    if staff is None:
        staff = MerchantStaff(
            merchant_id=merchant.id, wallet_address=payload.wallet_address, active=True
        )
        session.add(staff)
    else:
        staff.active = True
    await session.flush()
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="merchant.staff_granted",
            entity_type="merchant_staff",
            entity_id=str(staff.id),
        )
    )
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Staff wallet is already registered") from error
    await session.refresh(staff)
    return staff


@router.delete("/me/staff/{staff_id}", status_code=204)
async def revoke_staff(
    staff_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    merchant = await session.scalar(
        select(Merchant).where(Merchant.owner_user_id == current_user.id)
    )
    if merchant is None:
        raise HTTPException(status_code=404, detail="Merchant account not found")
    staff = await session.get(MerchantStaff, staff_id)
    if staff is None or staff.merchant_id != merchant.id:
        raise HTTPException(status_code=404, detail="Staff wallet not found")
    if staff.active:
        staff.active = False
        session.add(
            AuditLog(
                actor_id=current_user.id,
                action="merchant.staff_revoked",
                entity_type="merchant_staff",
                entity_id=str(staff.id),
            )
        )
        await session.commit()


@router.get("/staff/campaigns", response_model=list[StaffCampaignRead])
async def list_staff_campaigns(
    session: SessionDep, current_user: CurrentUserDep
) -> list[StaffCampaignRead]:
    result = await session.execute(
        select(Campaign, Merchant)
        .join(Merchant, Campaign.merchant_id == Merchant.id)
        .join(MerchantStaff, MerchantStaff.merchant_id == Merchant.id)
        .where(
            MerchantStaff.wallet_address == current_user.wallet_address,
            MerchantStaff.active.is_(True),
            Merchant.verification_status == VerificationStatus.VERIFIED,
            Campaign.status == CampaignStatus.PUBLISHED,
        )
    )
    return [
        StaffCampaignRead(
            campaign_id=campaign.id, title=campaign.title, merchant_name=merchant.business_name
        )
        for campaign, merchant in result.all()
    ]


@router.get("/campaigns/{campaign_id}/scan-access", response_model=CampaignScanAccess)
async def campaign_scan_access(
    campaign_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> CampaignScanAccess:
    campaign = await session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    merchant = await session.get(Merchant, campaign.merchant_id)
    if merchant is None or merchant.verification_status != VerificationStatus.VERIFIED:
        return CampaignScanAccess(role=None)
    if merchant.owner_user_id == current_user.id:
        return CampaignScanAccess(role="owner")
    staff = await session.scalar(
        select(MerchantStaff).where(
            MerchantStaff.merchant_id == merchant.id,
            MerchantStaff.wallet_address == current_user.wallet_address,
            MerchantStaff.active.is_(True),
        )
    )
    return CampaignScanAccess(role="staff" if staff else None)


@router.get("/{merchant_id}", response_model=MerchantRead)
async def get_merchant(merchant_id: uuid.UUID, session: SessionDep) -> Merchant:
    merchant = await session.get(Merchant, merchant_id)
    if merchant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant not found")
    return merchant
