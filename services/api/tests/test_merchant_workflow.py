import asyncio
import uuid
from typing import Any

import pytest
from fastapi import HTTPException

from app.api.routes.admin import decide_merchant_application
from app.api.routes.merchants import apply_as_merchant
from app.models.entities import AuditLog, Merchant, User, UserRole, VerificationStatus
from app.schemas.merchants import MerchantCreate, MerchantDecision


class FakeSession:
    def __init__(self, *, scalar_result: Any = None, objects: dict[type, Any] | None = None):
        self.scalar_result = scalar_result
        self.objects = objects or {}
        self.added: list[Any] = []
        self.commits = 0

    async def scalar(self, _: Any) -> Any:
        return self.scalar_result

    async def get(self, model: type, _: Any) -> Any:
        return self.objects.get(model)

    def add(self, value: Any) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        for value in self.added:
            if isinstance(value, Merchant) and value.id is None:
                value.id = uuid.uuid4()
                value.verification_status = VerificationStatus.PENDING

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _: Any) -> None:
        return None


def user(role: UserRole = UserRole.CUSTOMER) -> User:
    return User(
        id=uuid.uuid4(),
        wallet_address="7YVValidSolanaWalletAddressForMerchantTest11111",
        role=role,
        status="active",
    )


def merchant(owner: User) -> Merchant:
    return Merchant(
        id=uuid.uuid4(),
        owner_user_id=owner.id,
        wallet_address=owner.wallet_address,
        business_name="Validex Cafe",
        description="Local test merchant",
        address="Brooklyn, New York",
        verification_status=VerificationStatus.PENDING,
    )


def test_customer_can_submit_one_merchant_application() -> None:
    applicant = user()
    session = FakeSession()
    payload = MerchantCreate(
        business_name="Validex Cafe",
        description="Local test merchant",
        address="Brooklyn, New York",
    )

    created = asyncio.run(apply_as_merchant(payload, session, applicant))

    assert created.owner_user_id == applicant.id
    assert created.wallet_address == applicant.wallet_address
    assert created.verification_status == VerificationStatus.PENDING
    assert any(isinstance(item, AuditLog) for item in session.added)
    assert session.commits == 1


def test_duplicate_merchant_application_is_rejected() -> None:
    applicant = user()
    session = FakeSession(scalar_result=merchant(applicant))

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            apply_as_merchant(
                MerchantCreate(business_name="Again", address="Brooklyn, New York"),
                session,
                applicant,
            )
        )

    assert error.value.status_code == 409


def test_admin_approval_promotes_owner_to_merchant() -> None:
    owner = user()
    application = merchant(owner)
    admin = user(UserRole.ADMIN)
    session = FakeSession(objects={Merchant: application, User: owner})

    decided = asyncio.run(
        decide_merchant_application(
            application.id,
            MerchantDecision(approved=True),
            session,
            admin,
        )
    )

    assert decided.verification_status == VerificationStatus.VERIFIED
    assert owner.role == UserRole.MERCHANT
    assert session.commits == 1


def test_admin_cannot_decide_application_twice() -> None:
    owner = user()
    application = merchant(owner)
    application.verification_status = VerificationStatus.VERIFIED
    session = FakeSession(objects={Merchant: application, User: owner})

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            decide_merchant_application(
                application.id,
                MerchantDecision(approved=False),
                session,
                user(UserRole.ADMIN),
            )
        )

    assert error.value.status_code == 409
