import base64
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.dependencies import CurrentUserDep, SessionDep
from app.core.config import get_settings
from app.domain.vouchers import (
    DomainRuleViolation,
    assert_campaign_purchasable,
    decrypt_voucher_secret,
    encrypt_voucher_secret,
    hash_voucher_secret,
)
from app.models.entities import AuditLog, Campaign, CampaignStatus, Voucher, VoucherStatus
from app.schemas.vouchers import (
    VoucherPurchaseIntent,
    VoucherPurchaseIntentResponse,
    VoucherRead,
)

router = APIRouter(prefix="/vouchers", tags=["vouchers"])
settings = get_settings()
RESERVING_STATUSES = (VoucherStatus.PENDING_CHAIN, VoucherStatus.ACTIVE)


def voucher_response(voucher: Voucher, *, price_minor: int | None = None) -> VoucherRead:
    secret = decrypt_voucher_secret(
        voucher.encrypted_secret,
        settings.voucher_encryption_secret,
    )
    payload = {
        "id": voucher.id,
        "campaign_id": voucher.campaign_id,
        "owner_user_id": voucher.owner_user_id,
        "status": voucher.status,
        "expires_at": voucher.expires_at,
        "purchased_at": voucher.purchased_at,
        "onchain_address": voucher.onchain_address,
        "secret_base64": base64.b64encode(secret).decode("ascii"),
        "voucher_hash_hex": voucher.voucher_hash.hex(),
    }
    if price_minor is not None:
        return VoucherPurchaseIntentResponse(**payload, price_minor=price_minor)
    return VoucherRead(**payload)


@router.post(
    "/purchase-intent",
    response_model=VoucherPurchaseIntentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_purchase_intent(
    payload: VoucherPurchaseIntent,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> VoucherPurchaseIntentResponse:
    campaign = await session.scalar(
        select(Campaign).where(Campaign.id == payload.campaign_id).with_for_update()
    )
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    buyer_count = await session.scalar(
        select(func.count(Voucher.id)).where(
            Voucher.campaign_id == campaign.id,
            Voucher.owner_user_id == current_user.id,
            Voucher.status.in_(RESERVING_STATUSES),
        )
    )
    pending_count = await session.scalar(
        select(func.count(Voucher.id)).where(
            Voucher.campaign_id == campaign.id,
            Voucher.status == VoucherStatus.PENDING_CHAIN,
        )
    )
    now = datetime.now(UTC)
    try:
        assert_campaign_purchasable(
            now=now,
            starts_at=campaign.starts_at,
            expires_at=campaign.expires_at,
            stock=campaign.stock,
            sold_count=campaign.sold_count + int(pending_count or 0),
            per_user_limit=campaign.per_user_limit,
            buyer_purchase_count=int(buyer_count or 0),
            is_published=campaign.status == CampaignStatus.PUBLISHED,
        )
    except DomainRuleViolation as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    secret = secrets.token_bytes(32)
    voucher = Voucher(
        voucher_hash=hash_voucher_secret(secret),
        encrypted_secret=encrypt_voucher_secret(secret, settings.voucher_encryption_secret),
        campaign_id=campaign.id,
        owner_user_id=current_user.id,
        status=VoucherStatus.PENDING_CHAIN,
        expires_at=campaign.expires_at,
    )
    session.add(voucher)
    await session.flush()
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="voucher.purchase_intent_created",
            entity_type="voucher",
            entity_id=str(voucher.id),
        )
    )
    await session.commit()
    await session.refresh(voucher)
    return voucher_response(voucher, price_minor=campaign.price_minor)


@router.get("/my", response_model=list[VoucherRead])
async def list_my_vouchers(
    session: SessionDep,
    current_user: CurrentUserDep,
) -> list[VoucherRead]:
    result = await session.scalars(
        select(Voucher)
        .where(Voucher.owner_user_id == current_user.id)
        .order_by(Voucher.created_at.desc())
    )
    return [voucher_response(voucher) for voucher in result]


@router.get("/{voucher_id}", response_model=VoucherRead)
async def get_my_voucher(
    voucher_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> VoucherRead:
    voucher = await session.get(Voucher, voucher_id)
    if voucher is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if voucher.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Voucher access denied")
    return voucher_response(voucher)
