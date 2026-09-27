import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import MerchantUserDep, SessionDep
from app.domain.solana_chain import (
    ChainVerificationError,
    campaign_context,
    verify_campaign,
    verify_cancelled_campaign,
)
from app.domain.transaction_proofs import cancel_campaign_proof, create_campaign_proof
from app.domain.transaction_tracker import verify_transaction
from app.models.entities import (
    AuditLog,
    Campaign,
    CampaignStatus,
    Merchant,
    Transaction,
    TransactionStatus,
    VerificationStatus,
)
from app.schemas.campaigns import (
    CampaignCancellation,
    CampaignCreate,
    CampaignCreateOnchain,
    CampaignRead,
)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])
CampaignStatusQuery = Annotated[CampaignStatus | None, Query(alias="status")]
LimitQuery = Annotated[int, Query(ge=1, le=100)]
OffsetQuery = Annotated[int, Query(ge=0)]


def campaign_read(campaign: Campaign, merchant: Merchant) -> CampaignRead:
    return CampaignRead.model_validate(campaign).model_copy(
        update={
            "merchant_wallet": merchant.wallet_address,
            "merchant_name": merchant.business_name,
            "merchant_address": merchant.address,
        }
    )


@router.get("", response_model=list[CampaignRead])
async def list_campaigns(
    session: SessionDep,
    campaign_status: CampaignStatusQuery = CampaignStatus.PUBLISHED,
    limit: LimitQuery = 50,
    offset: OffsetQuery = 0,
) -> list[CampaignRead]:
    query = (
        select(Campaign, Merchant)
        .join(Merchant, Campaign.merchant_id == Merchant.id)
        .order_by(Campaign.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if campaign_status is not None:
        query = query.where(Campaign.status == campaign_status)
    result = await session.execute(query)
    return [campaign_read(campaign, merchant) for campaign, merchant in result.all()]


@router.get("/{campaign_id}", response_model=CampaignRead)
async def get_campaign(
    campaign_id: uuid.UUID,
    session: SessionDep,
) -> CampaignRead:
    campaign = await session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    merchant = await session.get(Merchant, campaign.merchant_id)
    if merchant is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Merchant not found")
    return campaign_read(campaign, merchant)


@router.post("/onchain", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_onchain_campaign(
    payload: CampaignCreateOnchain,
    session: SessionDep,
    current_user: MerchantUserDep,
) -> CampaignRead:
    merchant = await session.get(Merchant, payload.merchant_id)
    if (
        merchant is None
        or merchant.owner_user_id != current_user.id
        or merchant.verification_status != VerificationStatus.VERIFIED
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Verified merchant required"
        )
    prior = await session.scalar(
        select(Transaction).where(Transaction.signature == payload.transaction_signature)
    )
    if prior is not None:
        if prior.type == "create_campaign" and prior.campaign_id:
            campaign = await session.get(Campaign, prior.campaign_id)
            if (
                campaign is not None
                and campaign.onchain_address == payload.onchain_address
                and campaign.merchant_id == merchant.id
            ):
                return campaign_read(campaign, merchant)
        raise HTTPException(status_code=409, detail="Transaction signature has already been used")
    legacy = await session.scalar(
        select(Campaign).where(Campaign.transaction_signature == payload.transaction_signature)
    )
    if legacy is not None:
        raise HTTPException(status_code=409, detail="Transaction signature has already been used")
    try:
        metadata = [
            current_user.wallet_address,
            payload.title,
            payload.description,
            payload.price_minor,
            payload.original_value_minor,
            payload.stock,
            payload.per_user_limit,
            int(payload.starts_at.timestamp()),
            int(payload.expires_at.timestamp()),
        ]
        metadata_hash = hashlib.sha256(
            json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).digest()
        await verify_campaign(
            address=payload.onchain_address,
            merchant_wallet=current_user.wallet_address,
            price_minor=payload.price_minor,
            stock=payload.stock,
            per_user_limit=payload.per_user_limit,
            starts_at=int(payload.starts_at.timestamp()),
            expires_at=int(payload.expires_at.timestamp()),
            metadata_hash=metadata_hash,
        )
        context = await campaign_context(payload.onchain_address)
        if context.authority != current_user.wallet_address:
            raise ChainVerificationError("Campaign authority differs from authenticated wallet")
        await verify_transaction(
            payload.transaction_signature,
            create_campaign_proof(
                context,
                campaign_address=payload.onchain_address,
                campaign_id=payload.external_id,
                metadata_hash=metadata_hash,
                price_minor=payload.price_minor,
                stock=payload.stock,
                per_user_limit=payload.per_user_limit,
                starts_at=int(payload.starts_at.timestamp()),
                expires_at=int(payload.expires_at.timestamp()),
            ),
        )
    except ChainVerificationError as error:
        session.add(
            AuditLog(
                actor_id=current_user.id,
                action="security.transaction_rejected",
                entity_type="campaign",
                entity_id=payload.onchain_address,
            )
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    campaign = Campaign(**payload.model_dump(), status=CampaignStatus.PUBLISHED)
    session.add(campaign)
    try:
        await session.flush()
        session.add(
            Transaction(
                signature=payload.transaction_signature,
                type="create_campaign",
                user_id=current_user.id,
                merchant_id=merchant.id,
                campaign_id=campaign.id,
                status=TransactionStatus.FINALIZED,
                confirmed_at=datetime.now(UTC),
            )
        )
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Transaction signature has already been used"
        ) from error
    await session.refresh(campaign)
    return campaign_read(campaign, merchant)


@router.post("/{campaign_id}/cancel-confirm", response_model=CampaignRead)
async def confirm_campaign_cancellation(
    campaign_id: uuid.UUID,
    payload: CampaignCancellation,
    session: SessionDep,
    current_user: MerchantUserDep,
) -> CampaignRead:
    campaign = await session.scalar(
        select(Campaign).where(Campaign.id == campaign_id).with_for_update()
    )
    if campaign is None or not campaign.onchain_address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    merchant = await session.get(Merchant, campaign.merchant_id)
    if merchant is None or merchant.owner_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Campaign not owned by wallet"
        )
    prior = await session.scalar(
        select(Transaction).where(Transaction.signature == payload.transaction_signature)
    )
    if prior is not None:
        if (
            prior.type == "cancel_campaign"
            and prior.campaign_id == campaign.id
            and campaign.status == CampaignStatus.CANCELLED
        ):
            return campaign_read(campaign, merchant)
        raise HTTPException(status_code=409, detail="Transaction signature has already been used")
    if campaign.status == CampaignStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="Campaign is already cancelled")
    try:
        await verify_cancelled_campaign(campaign.onchain_address, current_user.wallet_address)
        context = await campaign_context(campaign.onchain_address)
        if context.authority != current_user.wallet_address:
            raise ChainVerificationError("Campaign authority differs from authenticated wallet")
        await verify_transaction(
            payload.transaction_signature,
            cancel_campaign_proof(context, campaign.onchain_address),
        )
    except ChainVerificationError as error:
        session.add(
            AuditLog(
                actor_id=current_user.id,
                action="security.transaction_rejected",
                entity_type="campaign",
                entity_id=str(campaign.id),
            )
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    campaign.status = CampaignStatus.CANCELLED
    session.add(
        Transaction(
            signature=payload.transaction_signature,
            type="cancel_campaign",
            user_id=current_user.id,
            merchant_id=merchant.id,
            campaign_id=campaign.id,
            status=TransactionStatus.FINALIZED,
            confirmed_at=datetime.now(UTC),
        )
    )
    session.add(
        AuditLog(
            actor_id=current_user.id,
            action="campaign.cancelled",
            entity_type="campaign",
            entity_id=str(campaign.id),
        )
    )
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="Transaction signature has already been used"
        ) from error
    await session.refresh(campaign)
    return campaign_read(campaign, merchant)


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    session: SessionDep,
    current_user: MerchantUserDep,
) -> Campaign:
    merchant = await session.get(Merchant, payload.merchant_id)
    if merchant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant not found")
    if merchant.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Merchant must be verified before creating campaigns",
        )
    if merchant.owner_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Merchant account does not belong to the authenticated wallet",
        )

    campaign = Campaign(**payload.model_dump(), status=CampaignStatus.DRAFT)
    session.add(campaign)
    await session.commit()
    await session.refresh(campaign)
    return campaign
