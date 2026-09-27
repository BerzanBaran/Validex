import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import base58
import pytest
from fastapi import HTTPException

from app.api.routes import vouchers as routes
from app.api.routes.merchants import campaign_scan_access
from app.models.entities import (
    AuditLog,
    Campaign,
    CampaignStatus,
    Merchant,
    MerchantStaff,
    User,
    VerificationStatus,
    Voucher,
    VoucherStatus,
)
from app.schemas.vouchers import VoucherScanRequest


class FakeSession:
    def __init__(self, campaign, merchant, voucher, owner, staff):
        self.objects = {
            (Campaign, campaign.id): campaign,
            (Merchant, merchant.id): merchant,
            (Voucher, voucher.id): voucher,
            (User, owner.id): owner,
        }
        self.staff = staff
        self.added = []
        self.commits = 0

    async def get(self, model, identifier):
        return self.objects.get((model, identifier))

    async def scalar(self, _query):
        return self.staff

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.commits += 1


def setup_scan():
    def address(byte: int) -> str:
        return base58.b58encode(bytes([byte]) * 32).decode("ascii")

    owner = User(id=uuid.uuid4(), wallet_address=address(1))
    merchant_owner = User(id=uuid.uuid4(), wallet_address=address(2))
    staff_user = User(id=uuid.uuid4(), wallet_address=address(3))
    merchant = Merchant(
        id=uuid.uuid4(),
        owner_user_id=merchant_owner.id,
        verification_status=VerificationStatus.VERIFIED,
    )
    campaign = Campaign(
        id=uuid.uuid4(),
        merchant_id=merchant.id,
        onchain_address=address(4),
        status=CampaignStatus.PUBLISHED,
        title="Coffee",
        price_minor=5_000_000,
    )
    voucher = Voucher(
        id=uuid.uuid4(),
        campaign_id=campaign.id,
        owner_user_id=owner.id,
        voucher_hash=bytes([7]) * 32,
        onchain_address=address(5),
        status=VoucherStatus.ACTIVE,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    staff = MerchantStaff(
        merchant_id=merchant.id, wallet_address=staff_user.wallet_address, active=True
    )
    payload = VoucherScanRequest(
        v=1,
        type="validex-voucher",
        voucherId=voucher.id,
        campaignId=campaign.id,
        code=f"VLDX-{voucher.voucher_hash.hex()[:12].upper()}",
        ownerWallet=owner.wallet_address,
        chainVoucher=voucher.onchain_address,
    )
    return FakeSession(campaign, merchant, voucher, owner, staff), staff_user, payload


def test_active_staff_can_verify_but_cannot_sign(monkeypatch):
    session, staff_user, payload = setup_scan()
    checked = []

    async def verify_voucher(**kwargs):
        checked.append(kwargs)

    async def account_data(_address):
        data = bytearray(180)
        data[:8] = routes.discriminator("Campaign")
        return bytes(data)

    monkeypatch.setattr(routes, "verify_voucher", verify_voucher)
    monkeypatch.setattr(routes, "account_data", account_data)
    result = asyncio.run(routes.scan_voucher(payload, session, staff_user))

    assert result.can_prepare_redemption is False
    assert checked[0]["expected_status"] == 0
    assert session.commits == 1
    assert any(
        isinstance(item, AuditLog) and item.action == "voucher.qr_verified"
        for item in session.added
    )


def test_owner_can_prepare_redemption_after_api_and_chain_check(monkeypatch):
    session, _, payload = setup_scan()
    merchant = next(value for (model, _), value in session.objects.items() if model is Merchant)
    owner = User(id=merchant.owner_user_id, wallet_address="owner-wallet")

    async def verify_voucher(**_kwargs):
        return None

    async def account_data(_address):
        data = bytearray(180)
        data[:8] = routes.discriminator("Campaign")
        return bytes(data)

    monkeypatch.setattr(routes, "verify_voucher", verify_voucher)
    monkeypatch.setattr(routes, "account_data", account_data)
    result = asyncio.run(routes.scan_voucher(payload, session, owner))
    assert result.can_prepare_redemption is True


def test_fake_qr_is_rejected_and_audited():
    session, staff_user, payload = setup_scan()
    bad = payload.model_copy(update={"code": "VLDX-FAKE"})

    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.scan_voucher(bad, session, staff_user))

    assert error.value.status_code == 403
    assert any(
        isinstance(item, AuditLog) and item.action == "security.qr_rejected"
        for item in session.added
    )


def test_unauthorized_wallet_is_rejected_and_audited():
    session, _, payload = setup_scan()
    session.staff = None
    stranger = User(id=uuid.uuid4(), wallet_address="stranger-wallet")

    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.scan_voucher(payload, session, stranger))

    assert error.value.status_code == 403
    assert any(
        isinstance(item, AuditLog) and item.action == "security.unauthorized_scan"
        for item in session.added
    )


def test_cancelled_chain_campaign_is_rejected(monkeypatch):
    session, staff_user, payload = setup_scan()

    async def verify_voucher(**_kwargs):
        return None

    async def account_data(_address):
        data = bytearray(180)
        data[:8] = routes.discriminator("Campaign")
        data[178] = 1
        return bytes(data)

    monkeypatch.setattr(routes, "verify_voucher", verify_voucher)
    monkeypatch.setattr(routes, "account_data", account_data)

    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.scan_voucher(payload, session, staff_user))

    assert error.value.status_code == 403
    assert any(
        isinstance(item, AuditLog) and item.action == "security.qr_chain_mismatch"
        for item in session.added
    )


def test_staff_revocation_removes_scan_access():
    session, staff_user, payload = setup_scan()

    allowed = asyncio.run(campaign_scan_access(payload.campaignId, session, staff_user))
    assert allowed.role == "staff"

    session.staff = None
    denied = asyncio.run(campaign_scan_access(payload.campaignId, session, staff_user))
    assert denied.role is None
