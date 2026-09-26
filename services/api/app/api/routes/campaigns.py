import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.entities import Campaign, CampaignStatus, Merchant, VerificationStatus
from app.schemas.campaigns import CampaignCreate, CampaignRead

router = APIRouter(prefix="/campaigns", tags=["campaigns"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]
CampaignStatusQuery = Annotated[CampaignStatus | None, Query(alias="status")]
LimitQuery = Annotated[int, Query(ge=1, le=100)]


@router.get("", response_model=list[CampaignRead])
async def list_campaigns(
    session: SessionDep,
    campaign_status: CampaignStatusQuery = CampaignStatus.PUBLISHED,
    limit: LimitQuery = 50,
) -> list[Campaign]:
    query = select(Campaign).order_by(Campaign.created_at.desc()).limit(limit)
    if campaign_status is not None:
        query = query.where(Campaign.status == campaign_status)
    result = await session.scalars(query)
    return list(result)


@router.get("/{campaign_id}", response_model=CampaignRead)
async def get_campaign(
    campaign_id: uuid.UUID,
    session: SessionDep,
) -> Campaign:
    campaign = await session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    session: SessionDep,
) -> Campaign:
    merchant = await session.get(Merchant, payload.merchant_id)
    if merchant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant not found")
    if merchant.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Merchant must be verified before creating campaigns",
        )

    campaign = Campaign(**payload.model_dump(), status=CampaignStatus.DRAFT)
    session.add(campaign)
    await session.commit()
    await session.refresh(campaign)
    return campaign
