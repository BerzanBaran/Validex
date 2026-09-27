import asyncio
import uuid

import base58
import pytest
from fastapi import HTTPException

from app.api.routes.merchants import grant_staff, revoke_staff
from app.models.entities import AuditLog, Merchant, MerchantStaff, User, VerificationStatus
from app.schemas.merchants import StaffGrant


class FakeSession:
    def __init__(self, merchant: Merchant, staff: MerchantStaff | None = None):
        self.merchant = merchant
        self.staff = staff
        self.added = []
        self.commits = 0

    async def scalar(self, _query):
        if not hasattr(self, "_read_once"):
            self._read_once = True
            return self.merchant
        return self.staff

    async def get(self, _model, _identifier):
        return self.staff

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        for value in self.added:
            if isinstance(value, MerchantStaff) and value.id is None:
                value.id = uuid.uuid4()

    async def commit(self):
        self.commits += 1

    async def refresh(self, _value):
        return None


def setup_owner():
    wallet = base58.b58encode(bytes([1]) * 32).decode("ascii")
    staff_wallet = base58.b58encode(bytes([2]) * 32).decode("ascii")
    owner = User(id=uuid.uuid4(), wallet_address=wallet)
    merchant = Merchant(
        id=uuid.uuid4(),
        owner_user_id=owner.id,
        verification_status=VerificationStatus.VERIFIED,
    )
    return owner, merchant, staff_wallet


def test_verified_owner_grants_only_qr_wallet_access():
    owner, merchant, staff_wallet = setup_owner()
    session = FakeSession(merchant)

    granted = asyncio.run(grant_staff(StaffGrant(wallet_address=staff_wallet), session, owner))

    assert granted.wallet_address == staff_wallet
    assert granted.active is True
    assert session.commits == 1
    assert any(
        isinstance(item, AuditLog) and item.action == "merchant.staff_granted"
        for item in session.added
    )


def test_owner_can_revoke_and_foreign_staff_cannot_be_revoked():
    owner, merchant, staff_wallet = setup_owner()
    staff = MerchantStaff(
        id=uuid.uuid4(), merchant_id=merchant.id, wallet_address=staff_wallet, active=True
    )
    session = FakeSession(merchant, staff)
    asyncio.run(revoke_staff(staff.id, session, owner))
    assert staff.active is False
    assert session.commits == 1

    staff.active = True
    staff.merchant_id = uuid.uuid4()
    with pytest.raises(HTTPException) as error:
        asyncio.run(revoke_staff(staff.id, FakeSession(merchant, staff), owner))
    assert error.value.status_code == 404
