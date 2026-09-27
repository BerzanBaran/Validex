import uuid
from datetime import UTC, datetime

from app.api.routes.vouchers import voucher_response
from app.core.config import get_settings
from app.domain.vouchers import encrypt_voucher_secret, hash_voucher_secret
from app.models.entities import Campaign, Merchant, Voucher, VoucherStatus


def test_voucher_response_contains_database_campaign_details() -> None:
    secret = b"s" * 32
    merchant = Merchant(id=uuid.uuid4(), business_name="Validex Cafe")
    campaign = Campaign(
        id=uuid.uuid4(),
        merchant_id=merchant.id,
        title="İki kahve",
        price_minor=5_000_000,
    )
    voucher = Voucher(
        id=uuid.uuid4(),
        campaign_id=campaign.id,
        owner_user_id=uuid.uuid4(),
        voucher_hash=hash_voucher_secret(secret),
        encrypted_secret=encrypt_voucher_secret(secret, get_settings().voucher_encryption_secret),
        status=VoucherStatus.PENDING_CHAIN,
        expires_at=datetime(2027, 2, 1, tzinfo=UTC),
    )

    response = voucher_response(voucher, campaign=campaign, merchant=merchant)

    assert response.status == VoucherStatus.PENDING_CHAIN
    assert response.onchain_address is None
    assert response.campaign_title == "İki kahve"
    assert response.merchant_name == "Validex Cafe"
    assert response.price_minor == 5_000_000
    assert response.purchased_at is None
