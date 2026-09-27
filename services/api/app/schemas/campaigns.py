import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.entities import CampaignStatus


class CampaignCreate(BaseModel):
    merchant_id: uuid.UUID
    external_id: str = Field(min_length=8, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=10, max_length=4_000)
    terms: str = Field(default="", max_length=4_000)
    price_minor: int = Field(gt=0)
    original_value_minor: int = Field(gt=0)
    stock: int = Field(gt=0, le=100_000)
    per_user_limit: int = Field(default=1, gt=0, le=100)
    starts_at: datetime
    expires_at: datetime

    @model_validator(mode="after")
    def validate_campaign_window(self) -> "CampaignCreate":
        if self.expires_at <= self.starts_at:
            raise ValueError("expires_at must be later than starts_at")
        if self.original_value_minor < self.price_minor:
            raise ValueError("original value cannot be lower than voucher price")
        return self


class CampaignCreateOnchain(CampaignCreate):
    onchain_address: str = Field(min_length=32, max_length=44)
    transaction_signature: str = Field(min_length=64, max_length=88)


class CampaignCancellation(BaseModel):
    transaction_signature: str = Field(min_length=64, max_length=88)


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    external_id: str
    merchant_id: uuid.UUID
    title: str
    description: str
    terms: str
    price_minor: int
    original_value_minor: int
    stock: int
    sold_count: int
    per_user_limit: int
    starts_at: datetime
    expires_at: datetime
    status: CampaignStatus
    onchain_address: str | None
    merchant_wallet: str | None = None
    merchant_name: str | None = None
    merchant_address: str | None = None
