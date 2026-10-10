import base64
import binascii
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUserDep, SessionDep
from app.core.config import get_settings
from app.domain.solana_chain import (
    ChainVerificationError,
    account_data,
    campaign_context,
    discriminator,
    verify_voucher,
)
from app.domain.transaction_proofs import purchase_proof, redeem_proof, refund_proof
from app.domain.transaction_tracker import verify_transaction
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
    Merchant,
    MerchantStaff,
    Transaction,
    TransactionStatus,
    User,
    VerificationStatus,
    Voucher,
    VoucherStatus,
)
from app.schemas.vouchers import (
    VoucherChainConfirmation,
    VoucherPurchaseIntent,
    VoucherPurchaseIntentResponse,
    VoucherRead,
    VoucherScanRequest,
    VoucherScanResult,
)

router = APIRouter(prefix="/vouchers", tags=["vouchers"])
settings = get_settings()
PENDING_RESERVATION_MINUTES = 15


@router.post("/scan", response_model=VoucherScanResult)
async def scan_voucher(
    payload: VoucherScanRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> VoucherScanResult:
    async def reject(detail: str, action: str = "security.qr_rejected") -> None:
        session.add(
            AuditLog(
                actor_id=current_user.id,
                action=action,
                entity_type="voucher",
                entity_id=str(payload.voucherId),
            )
        )
        await session.commit()
        raise HTTPException(status_code=403, detail=detail)

    campaign = await session.get(Campaign, payload.campaignId)
    if campaign is None or not campaign.onchain_address:
        await reject("Voucher campaign is not available")
    merchant = await session.get(Merchant, campaign.merchant_id)
    if merchant is None or merchant.verification_status != VerificationStatus.VERIFIED:
        await reject("Voucher merchant is not available")
    is_owner = merchant.owner_user_id == current_user.id
    staff = (
        None
        if is_owner
        else await session.scalar(
            select(MerchantStaff).where(
                MerchantStaff.merchant_id == merchant.id,
                MerchantStaff.wallet_address == current_user.wallet_address,
                MerchantStaff.active.is_(True),
            )
        )
    )
    if not is_owner and staff is None:
        await reject("Merchant staff access required", "security.unauthorized_scan")
    voucher = await session.get(Voucher, payload.voucherId)
    owner = await session.get(User, voucher.owner_user_id) if voucher else None
    try:
        presented_secret = base64.b64decode(payload.secret, validate=True)
    except (binascii.Error, ValueError):
        await reject("Voucher secret is invalid")
    if len(presented_secret) != 32:
        await reject("Voucher secret is invalid")
    if (
        payload.v != 1
        or payload.type != "validex-voucher"
        or voucher is None
        or owner is None
        or voucher.campaign_id != campaign.id
        or voucher.status != VoucherStatus.ACTIVE
        or voucher.expires_at <= datetime.now(UTC)
        or campaign.status != CampaignStatus.PUBLISHED
        or voucher.onchain_address != payload.chainVoucher
        or owner.wallet_address != payload.ownerWallet
        or payload.code != f"VLDX-{voucher.voucher_hash.hex()[:12].upper()}"
        or not secrets.compare_digest(
            hash_voucher_secret(presented_secret), voucher.voucher_hash
        )
    ):
        await reject("Voucher is invalid, expired or already used")
    try:
        await verify_voucher(
            address=payload.chainVoucher,
            campaign_address=campaign.onchain_address,
            buyer_wallet=owner.wallet_address,
            voucher_hash=voucher.voucher_hash,
            expected_status=0,
            expected_price_minor=campaign.price_minor,
        )
        chain_campaign = await account_data(campaign.onchain_address)
        if (
            len(chain_campaign) < 180
            or chain_campaign[:8] != discriminator("Campaign")
            or chain_campaign[178] != 0
        ):
            raise ChainVerificationError("Campaign is cancelled on-chain")
    except ChainVerificationError as error:
        await reject(str(error), "security.qr_chain_mismatch")
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="voucher.qr_verified",
            entity_type="voucher",
            entity_id=str(voucher.id),
        )
    )
    await session.commit()
    return VoucherScanResult(
        voucher_id=voucher.id,
        campaign_id=campaign.id,
        campaign_title=campaign.title,
        owner_wallet=owner.wallet_address,
        chain_voucher=payload.chainVoucher,
        can_prepare_redemption=is_owner,
    )


async def assert_signature_available(
    session: SessionDep,
    signature: str,
    *,
    action: str,
    voucher_id: uuid.UUID,
    allow_same: bool = False,
) -> None:
    existing = await session.scalar(select(Transaction).where(Transaction.signature == signature))
    if existing is None:
        legacy_campaign = await session.scalar(
            select(Campaign).where(Campaign.transaction_signature == signature)
        )
        if legacy_campaign is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Transaction signature has already been used",
            )
        if allow_same:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Voucher state has no matching transaction record",
            )
        return
    if allow_same and existing.type == action and existing.voucher_id == voucher_id:
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Transaction signature has already been used",
    )


async def commit_verified_transaction(session: SessionDep) -> None:
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction signature has already been used",
        ) from error


async def record_rejected_transaction(
    session: SessionDep, *, user_id: uuid.UUID, voucher_id: uuid.UUID
) -> None:
    session.add(
        AuditLog(
            actor_id=user_id,
            action="security.transaction_rejected",
            entity_type="voucher",
            entity_id=str(voucher_id),
        )
    )
    await session.commit()


def voucher_response(
    voucher: Voucher,
    *,
    price_minor: int | None = None,
    campaign: Campaign | None = None,
    merchant: Merchant | None = None,
) -> VoucherRead:
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
        "campaign_title": campaign.title if campaign else None,
        "merchant_name": merchant.business_name if merchant else None,
        "price_minor": (
            price_minor if price_minor is not None else campaign.price_minor if campaign else None
        ),
        "redeemed_at": voucher.redeemed_at,
        "campaign_cancelled": campaign.status == CampaignStatus.CANCELLED if campaign else False,
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
    return voucher_response(voucher, price_minor=campaign.price_minor, campaign=campaign)


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
        await assert_signature_available(
            session,
            payload.transaction_signature,
            action="purchase",
            voucher_id=voucher.id,
            allow_same=True,
        )
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
    await assert_signature_available(
        session,
        payload.transaction_signature,
        action="purchase",
        voucher_id=voucher.id,
    )
    try:
        await verify_voucher(
            address=payload.onchain_address,
            campaign_address=campaign.onchain_address,
            buyer_wallet=current_user.wallet_address,
            voucher_hash=voucher.voucher_hash,
            expected_status=0,
            expected_price_minor=campaign.price_minor,
        )
        context = await campaign_context(campaign.onchain_address)
        await verify_transaction(
            payload.transaction_signature,
            purchase_proof(
                context,
                buyer=current_user.wallet_address,
                campaign=campaign.onchain_address,
                voucher=payload.onchain_address,
                voucher_hash=voucher.voucher_hash,
                price_minor=campaign.price_minor,
            ),
        )
    except ChainVerificationError as error:
        await record_rejected_transaction(session, user_id=current_user.id, voucher_id=voucher.id)
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
            status=TransactionStatus.FINALIZED,
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
    await commit_verified_transaction(session)
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
        await assert_signature_available(
            session,
            payload.transaction_signature,
            action="redeem",
            voucher_id=voucher.id,
            allow_same=True,
        )
        return voucher_response(voucher)
    if voucher.status != VoucherStatus.ACTIVE or voucher.onchain_address != payload.onchain_address:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voucher is not active")
    campaign = await session.get(Campaign, voucher.campaign_id)
    if campaign is None or not campaign.onchain_address:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Campaign has no on-chain account"
        )
    await assert_signature_available(
        session,
        payload.transaction_signature,
        action="redeem",
        voucher_id=voucher.id,
    )
    try:
        await verify_voucher(
            address=payload.onchain_address,
            campaign_address=campaign.onchain_address,
            buyer_wallet=current_user.wallet_address,
            voucher_hash=voucher.voucher_hash,
            expected_status=1,
            expected_price_minor=campaign.price_minor,
        )
        context = await campaign_context(campaign.onchain_address)
        await verify_transaction(
            payload.transaction_signature,
            redeem_proof(
                context,
                buyer=current_user.wallet_address,
                campaign=campaign.onchain_address,
                voucher=payload.onchain_address,
                price_minor=campaign.price_minor,
            ),
        )
    except ChainVerificationError as error:
        await record_rejected_transaction(session, user_id=current_user.id, voucher_id=voucher.id)
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
            status=TransactionStatus.FINALIZED,
            confirmed_at=datetime.now(UTC),
        )
    )
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="voucher.redeemed",
            entity_type="voucher",
            entity_id=str(voucher.id),
        )
    )
    await commit_verified_transaction(session)
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
        await assert_signature_available(
            session,
            payload.transaction_signature,
            action="refund",
            voucher_id=voucher.id,
            allow_same=True,
        )
        return voucher_response(voucher)
    if voucher.status != VoucherStatus.ACTIVE or voucher.onchain_address != payload.onchain_address:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Voucher is not active")
    campaign = await session.get(Campaign, voucher.campaign_id)
    if campaign is None or not campaign.onchain_address:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Campaign has no on-chain account"
        )
    await assert_signature_available(
        session,
        payload.transaction_signature,
        action="refund",
        voucher_id=voucher.id,
    )
    try:
        await verify_voucher(
            address=payload.onchain_address,
            campaign_address=campaign.onchain_address,
            buyer_wallet=current_user.wallet_address,
            voucher_hash=voucher.voucher_hash,
            expected_status=2,
            expected_price_minor=campaign.price_minor,
        )
        context = await campaign_context(campaign.onchain_address)
        await verify_transaction(
            payload.transaction_signature,
            refund_proof(
                context,
                buyer=current_user.wallet_address,
                campaign=campaign.onchain_address,
                voucher=payload.onchain_address,
                price_minor=campaign.price_minor,
            ),
        )
    except ChainVerificationError as error:
        await record_rejected_transaction(session, user_id=current_user.id, voucher_id=voucher.id)
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
            status=TransactionStatus.FINALIZED,
            confirmed_at=datetime.now(UTC),
        )
    )
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="voucher.refunded",
            entity_type="voucher",
            entity_id=str(voucher.id),
        )
    )
    await commit_verified_transaction(session)
    await session.refresh(voucher)
    return voucher_response(voucher)


@router.get("/my", response_model=list[VoucherRead])
async def list_my_vouchers(
    session: SessionDep,
    current_user: CurrentUserDep,
) -> list[VoucherRead]:
    result = await session.execute(
        select(Voucher, Campaign, Merchant)
        .join(Campaign, Voucher.campaign_id == Campaign.id)
        .join(Merchant, Campaign.merchant_id == Merchant.id)
        .where(Voucher.owner_user_id == current_user.id)
        .order_by(Voucher.created_at.desc())
    )
    return [
        voucher_response(voucher, campaign=campaign, merchant=merchant)
        for voucher, campaign, merchant in result.all()
    ]


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
    campaign = await session.get(Campaign, voucher.campaign_id)
    merchant = await session.get(Merchant, campaign.merchant_id) if campaign else None
    return voucher_response(voucher, campaign=campaign, merchant=merchant)
