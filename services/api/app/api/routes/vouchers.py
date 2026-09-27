import base64
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import and_, func, or_, select

from app.api.dependencies import CurrentUserDep, SessionDep
from app.core.config import get_settings
from app.domain.solana_chain import ChainVerificationError, verify_account_signature, verify_voucher
from app.domain.vouchers import (
    DomainRuleViolation,
    assert_campaign_purchasable,
    calculate_payment_split,
    decrypt_voucher_secret,
    encrypt_voucher_secret,
    hash_voucher_secret,
)
from app.models.entities import (
    AuditLog,
    Campaign,
    CampaignStatus,
    Transaction,
    TransactionStatus,
    Voucher,
    VoucherStatus,
)
from app.schemas.vouchers import (
    VoucherChainConfirmation,
    VoucherPurchaseIntent,
    VoucherPurchaseIntentResponse,
    VoucherRead,
)

router = APIRouter(prefix="/vouchers", tags=["vouchers"])
settings = get_settings()
PENDING_RESERVATION_MINUTES = 15


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

    now = datetime.now(UTC)
    pending_cutoff = now - timedelta(minutes=PENDING_RESERVATION_MINUTES)
    buyer_count = await session.scalar(
        select(func.count(Voucher.id)).where(
            Voucher.campaign_id == campaign.id,
            Voucher.owner_user_id == current_user.id,
            or_(
                Voucher.status.in_(
                    (VoucherStatus.ACTIVE, VoucherStatus.REDEEMED, VoucherStatus.REFUNDED)
                ),
                and_(
                    Voucher.status == VoucherStatus.PENDING_CHAIN,
                    Voucher.created_at >= pending_cutoff,
                ),
            ),
        )
    )
    pending_count = await session.scalar(
        select(func.count(Voucher.id)).where(
            Voucher.campaign_id == campaign.id,
            Voucher.status == VoucherStatus.PENDING_CHAIN,
            Voucher.created_at >= pending_cutoff,
        )
    )
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


@router.post("/{voucher_id}/confirm", response_model=VoucherRead)
async def confirm_purchase(
    voucher_id: uuid.UUID,
    payload: VoucherChainConfirmation,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> VoucherRead:
    voucher = await session.scalar(
        select(Voucher).where(Voucher.id == voucher_id).with_for_update()
    )
    if voucher is None or voucher.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if (
        voucher.status == VoucherStatus.ACTIVE
        and voucher.onchain_address == payload.onchain_address
    ):
        return voucher_response(voucher)
    if voucher.status != VoucherStatus.PENDING_CHAIN:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voucher is not pending")
    campaign = await session.scalar(
        select(Campaign).where(Campaign.id == voucher.campaign_id).with_for_update()
    )
    if campaign is None or not campaign.onchain_address:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Campaign has no on-chain account"
        )
    try:
        await verify_voucher(
            address=payload.onchain_address,
            campaign_address=campaign.onchain_address,
            buyer_wallet=current_user.wallet_address,
            voucher_hash=voucher.voucher_hash,
            expected_status=0,
        )
        await verify_account_signature(payload.onchain_address, payload.transaction_signature)
    except ChainVerificationError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    voucher.onchain_address = payload.onchain_address
    voucher.status = VoucherStatus.ACTIVE
    voucher.purchased_at = datetime.now(UTC)
    campaign.sold_count += 1
    session.add(
        Transaction(
            signature=payload.transaction_signature,
            type="purchase",
            user_id=current_user.id,
            campaign_id=campaign.id,
            voucher_id=voucher.id,
            gross_amount=campaign.price_minor,
            status=TransactionStatus.CONFIRMED,
            confirmed_at=datetime.now(UTC),
        )
    )
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="voucher.purchase_confirmed",
            entity_type="voucher",
            entity_id=str(voucher.id),
        )
    )
    await session.commit()
    await session.refresh(voucher)
    return voucher_response(voucher)


@router.post("/{voucher_id}/redeem-confirm", response_model=VoucherRead)
async def confirm_redemption(
    voucher_id: uuid.UUID,
    payload: VoucherChainConfirmation,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> VoucherRead:
    voucher = await session.scalar(
        select(Voucher).where(Voucher.id == voucher_id).with_for_update()
    )
    if voucher is None or voucher.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if (
        voucher.status == VoucherStatus.REDEEMED
        and voucher.onchain_address == payload.onchain_address
    ):
        return voucher_response(voucher)
    if voucher.status != VoucherStatus.ACTIVE or voucher.onchain_address != payload.onchain_address:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voucher is not active")
    campaign = await session.get(Campaign, voucher.campaign_id)
    if campaign is None or not campaign.onchain_address:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Campaign has no on-chain account"
        )
    try:
        await verify_voucher(
            address=payload.onchain_address,
            campaign_address=campaign.onchain_address,
            buyer_wallet=current_user.wallet_address,
            voucher_hash=voucher.voucher_hash,
            expected_status=1,
        )
        await verify_account_signature(payload.onchain_address, payload.transaction_signature)
    except ChainVerificationError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    split = calculate_payment_split(campaign.price_minor, 200)
    voucher.status = VoucherStatus.REDEEMED
    voucher.redeemed_at = datetime.now(UTC)
    session.add(
        Transaction(
            signature=payload.transaction_signature,
            type="redeem",
            user_id=current_user.id,
            campaign_id=campaign.id,
            voucher_id=voucher.id,
            gross_amount=split.gross_amount,
            commission_amount=split.commission_amount,
            merchant_amount=split.merchant_amount,
            status=TransactionStatus.CONFIRMED,
            confirmed_at=datetime.now(UTC),
        )
    )
    await session.commit()
    await session.refresh(voucher)
    return voucher_response(voucher)


@router.post("/{voucher_id}/refund-confirm", response_model=VoucherRead)
async def confirm_refund(
    voucher_id: uuid.UUID,
    payload: VoucherChainConfirmation,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> VoucherRead:
    voucher = await session.scalar(
        select(Voucher).where(Voucher.id == voucher_id).with_for_update()
    )
    if voucher is None or voucher.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if (
        voucher.status == VoucherStatus.REFUNDED
        and voucher.onchain_address == payload.onchain_address
    ):
        return voucher_response(voucher)
    if voucher.status != VoucherStatus.ACTIVE or voucher.onchain_address != payload.onchain_address:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voucher is not active")
    campaign = await session.get(Campaign, voucher.campaign_id)
    if campaign is None or not campaign.onchain_address:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Campaign has no on-chain account"
        )
    try:
        await verify_voucher(
            address=payload.onchain_address,
            campaign_address=campaign.onchain_address,
            buyer_wallet=current_user.wallet_address,
            voucher_hash=voucher.voucher_hash,
            expected_status=2,
        )
        await verify_account_signature(payload.onchain_address, payload.transaction_signature)
    except ChainVerificationError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    voucher.status = VoucherStatus.REFUNDED
    session.add(
        Transaction(
            signature=payload.transaction_signature,
            type="refund",
            user_id=current_user.id,
            campaign_id=campaign.id,
            voucher_id=voucher.id,
            gross_amount=campaign.price_minor,
            status=TransactionStatus.CONFIRMED,
            confirmed_at=datetime.now(UTC),
        )
    )
    await session.commit()
    await session.refresh(voucher)
    return voucher_response(voucher)


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
