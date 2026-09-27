import asyncio

import pytest
from fastapi import HTTPException

from app.api.routes import transactions
from app.domain.solana_chain import ChainVerificationError


def test_status_route_returns_confirmed_without_marking_voucher_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_status(_signature: str) -> str:
        return "confirmed"

    monkeypatch.setattr(transactions, "transaction_status", fake_status)
    result = asyncio.run(transactions.get_transaction_status("signature", object()))
    assert result.status == "confirmed"
    assert result.signature == "signature"


def test_status_route_rejects_invalid_rpc_proof(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_status(_signature: str) -> str:
        raise ChainVerificationError("Invalid signature")

    monkeypatch.setattr(transactions, "transaction_status", fake_status)
    with pytest.raises(HTTPException) as error:
        asyncio.run(transactions.get_transaction_status("bad", object()))
    assert error.value.status_code == 409
