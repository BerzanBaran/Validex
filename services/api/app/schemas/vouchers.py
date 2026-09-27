import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

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
    campaign_title: str | None = None
    merchant_name: str | None = None
    price_minor: int | None = None
    redeemed_at: datetime | None = None
    campaign_cancelled: bool = False


class VoucherPurchaseIntentResponse(VoucherRead):
    price_minor: int


class VoucherChainConfirmation(BaseModel):
    onchain_address: str = Field(min_length=32, max_length=44)
    transaction_signature: str = Field(min_length=64, max_length=88)


class VoucherScanRequest(BaseModel):
    v: int
    type: str
    voucherId: uuid.UUID
    campaignId: uuid.UUID
    code: str = Field(min_length=1, max_length=64)
    ownerWallet: str = Field(min_length=32, max_length=44)
    chainVoucher: str = Field(min_length=32, max_length=44)


class VoucherScanResult(BaseModel):
    voucher_id: uuid.UUID
    campaign_id: uuid.UUID
    campaign_title: str
    owner_wallet: str
    chain_voucher: str
    can_prepare_redemption: bool
