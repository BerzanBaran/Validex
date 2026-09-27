import asyncio
import uuid

import pytest
from fastapi import HTTPException

from app.api.routes.vouchers import assert_signature_available
from app.models.entities import Campaign, Transaction


class FakeSession:
    def __init__(self, transaction=None, campaign=None):
        self.results = [transaction, campaign]

    async def scalar(self, _query):
        return self.results.pop(0)


def test_same_signature_cannot_activate_two_vouchers() -> None:
    first_id = uuid.uuid4()
    second_id = uuid.uuid4()
    recorded = Transaction(signature="signature", type="purchase", voucher_id=first_id)

    with pytest.raises(HTTPException, match="already been used"):
        asyncio.run(
            assert_signature_available(
                FakeSession(recorded),
                "signature",
                action="purchase",
                voucher_id=second_id,
            )
        )


def test_retry_for_same_voucher_is_idempotent() -> None:
    voucher_id = uuid.uuid4()
    recorded = Transaction(signature="signature", type="purchase", voucher_id=voucher_id)

    asyncio.run(
        assert_signature_available(
            FakeSession(recorded),
            "signature",
            action="purchase",
            voucher_id=voucher_id,
            allow_same=True,
        )
    )


def test_legacy_campaign_signature_cannot_be_reused() -> None:
    campaign = Campaign(transaction_signature="signature")
    with pytest.raises(HTTPException, match="already been used"):
        asyncio.run(
            assert_signature_available(
                FakeSession(None, campaign),
                "signature",
                action="purchase",
                voucher_id=uuid.uuid4(),
            )
        )
