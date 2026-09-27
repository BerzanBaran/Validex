import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import VerificationStatus


class MerchantCreate(BaseModel):
    business_name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2_000)
    address: str = Field(min_length=5, max_length=500)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90, max_digits=9, decimal_places=6)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180, max_digits=9, decimal_places=6)


class MerchantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_user_id: uuid.UUID
    wallet_address: str
    business_name: str
    description: str
    address: str
    latitude: Decimal | None
    longitude: Decimal | None
    verification_status: VerificationStatus
    created_at: datetime


class MerchantDecision(BaseModel):
    approved: bool
    reason: str = Field(default="", max_length=500)


class StaffGrant(BaseModel):
    wallet_address: str = Field(min_length=32, max_length=44)


class StaffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    merchant_id: uuid.UUID
    wallet_address: str
    active: bool
    created_at: datetime


class StaffCampaignRead(BaseModel):
    campaign_id: uuid.UUID
    title: str
    merchant_name: str


class CampaignScanAccess(BaseModel):
    role: str | None
