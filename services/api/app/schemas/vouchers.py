import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.entities import VoucherStatus


class VoucherPurchaseIntent(BaseModel):
    campaign_id: uuid.UUID


class VoucherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: uuid.UUID
    owner_user_id: uuid.UUID
    status: VoucherStatus
    expires_at: datetime
    purchased_at: datetime | None
    onchain_address: str | None
    secret_base64: str
    voucher_hash_hex: str


class VoucherPurchaseIntentResponse(VoucherRead):
    price_minor: int
