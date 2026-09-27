import asyncio

import base58
import pytest

from app.domain import solana_chain


def address(byte: int) -> str:
    return base58.b58encode(bytes([byte]) * 32).decode("ascii")


def test_campaign_verification_checks_wallet_and_terms(monkeypatch: pytest.MonkeyPatch) -> None:
    campaign = bytearray(180)
    campaign[:8] = solana_chain.discriminator("Campaign")
    campaign[8:40] = bytes([2]) * 32
    campaign[40:72] = bytes([3]) * 32
    campaign[72:104] = bytes([4]) * 32
    campaign[112:144] = bytes([9]) * 32
    campaign[144:152] = (5_000_000).to_bytes(8, "little")
    campaign[152:156] = (10).to_bytes(4, "little")
    campaign[160:162] = (1).to_bytes(2, "little")
    campaign[162:170] = (100).to_bytes(8, "little", signed=True)
    campaign[170:178] = (200).to_bytes(8, "little", signed=True)
    merchant = bytearray(81)
    merchant[:8] = solana_chain.discriminator("Merchant")
    merchant[8:40] = bytes([3]) * 32
    merchant[40:72] = bytes([4]) * 32
    platform = bytearray(139)
    platform[:8] = solana_chain.discriminator("Platform")
    platform[72:104] = bytes([5]) * 32
    accounts = {
        address(1): bytes(campaign),
        address(2): bytes(merchant),
        address(4): bytes(platform),
    }

    async def fake_account_data(key: str) -> bytes:
        return accounts[key]

    class Settings:
        usdc_mint = address(5)

    monkeypatch.setattr(solana_chain, "account_data", fake_account_data)
    monkeypatch.setattr(solana_chain, "get_settings", lambda: Settings())
    asyncio.run(
        solana_chain.verify_campaign(
            address=address(1),
            merchant_wallet=address(3),
            metadata_hash=bytes([9]) * 32,
            price_minor=5_000_000,
            stock=10,
            per_user_limit=1,
            starts_at=100,
            expires_at=200,
        )
    )
    with pytest.raises(solana_chain.ChainVerificationError):
        asyncio.run(
            solana_chain.verify_campaign(
                address=address(1),
                merchant_wallet=address(6),
                metadata_hash=bytes([9]) * 32,
                price_minor=5_000_000,
                stock=10,
                per_user_limit=1,
                starts_at=100,
                expires_at=200,
            )
        )
    with pytest.raises(solana_chain.ChainVerificationError):
        asyncio.run(
            solana_chain.verify_campaign(
                address=address(1),
                merchant_wallet=address(3),
                metadata_hash=bytes([8]) * 32,
                price_minor=5_000_000,
                stock=10,
                per_user_limit=1,
                starts_at=100,
                expires_at=200,
            )
        )
    with pytest.raises(solana_chain.ChainVerificationError):
        asyncio.run(
            solana_chain.verify_campaign(
                address=address(1),
                merchant_wallet=address(3),
                metadata_hash=bytes([9]) * 32,
                price_minor=1,
                stock=10,
                per_user_limit=1,
                starts_at=100,
                expires_at=200,
            )
        )


def test_voucher_verification_requires_expected_status(monkeypatch: pytest.MonkeyPatch) -> None:
    voucher = bytearray(130)
    voucher[:8] = solana_chain.discriminator("Voucher")
    voucher[8:40] = bytes([1]) * 32
    voucher[40:72] = bytes([2]) * 32
    voucher[72:104] = bytes([3]) * 32

    async def fake_account_data(_key: str) -> bytes:
        return bytes(voucher)

    monkeypatch.setattr(solana_chain, "account_data", fake_account_data)
    asyncio.run(
        solana_chain.verify_voucher(
            address=address(4),
            campaign_address=address(1),
            buyer_wallet=address(2),
            voucher_hash=bytes([3]) * 32,
            expected_status=0,
        )
    )
    with pytest.raises(solana_chain.ChainVerificationError):
        asyncio.run(
            solana_chain.verify_voucher(
                address=address(4),
                campaign_address=address(1),
                buyer_wallet=address(2),
                voucher_hash=bytes([3]) * 32,
                expected_status=1,
            )
        )
    voucher[128] = 2
    asyncio.run(
        solana_chain.verify_voucher(
            address=address(4),
            campaign_address=address(1),
            buyer_wallet=address(2),
            voucher_hash=bytes([3]) * 32,
            expected_status=2,
        )
    )
