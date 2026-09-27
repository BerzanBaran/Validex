from datetime import UTC, datetime, timedelta

import pytest

from app.domain.vouchers import (
    DomainRuleViolation,
    assert_campaign_purchasable,
    assert_voucher_redeemable,
    calculate_payment_split,
    decrypt_voucher_secret,
    encrypt_voucher_secret,
    hash_voucher_secret,
)


def test_two_percent_commission_uses_integer_minor_units() -> None:
    split = calculate_payment_split(gross_amount=5_000_000, commission_bps=200)

    assert split.commission_amount == 100_000
    assert split.merchant_amount == 4_900_000
    assert split.gross_amount == split.commission_amount + split.merchant_amount


def test_commission_has_a_safety_cap() -> None:
    with pytest.raises(DomainRuleViolation, match="basis points"):
        calculate_payment_split(gross_amount=5_000_000, commission_bps=1_001)


def test_voucher_hash_requires_256_bit_secret() -> None:
    with pytest.raises(DomainRuleViolation, match="256 bits"):
        hash_voucher_secret(b"too-short")

    assert len(hash_voucher_secret(b"x" * 32)) == 32


def test_voucher_secret_is_encrypted_and_round_trips() -> None:
    secret = b"s" * 32
    encryption_secret = "test-encryption-secret-with-at-least-32-chars"

    ciphertext = encrypt_voucher_secret(secret, encryption_secret)

    assert secret not in ciphertext
    assert decrypt_voucher_secret(ciphertext, encryption_secret) == secret


def test_voucher_secret_cannot_be_decrypted_with_another_key() -> None:
    ciphertext = encrypt_voucher_secret(
        b"s" * 32,
        "first-encryption-secret-with-at-least-32-chars",
    )

    with pytest.raises(DomainRuleViolation, match="could not be decrypted"):
        decrypt_voucher_secret(
            ciphertext,
            "second-encryption-secret-with-at-least-32-chars",
        )


def test_sold_out_campaign_cannot_be_purchased() -> None:
    now = datetime.now(UTC)
    with pytest.raises(DomainRuleViolation, match="stock"):
        assert_campaign_purchasable(
            now=now,
            starts_at=now - timedelta(hours=1),
            expires_at=now + timedelta(hours=1),
            stock=10,
            sold_count=10,
            per_user_limit=2,
            buyer_purchase_count=0,
            is_published=True,
        )


def test_redeem_rejects_wrong_merchant_and_replay() -> None:
    now = datetime.now(UTC)
    with pytest.raises(DomainRuleViolation, match="campaign merchant"):
        assert_voucher_redeemable(
            now=now,
            expires_at=now + timedelta(hours=1),
            status="active",
            signer_merchant_id="merchant-b",
            campaign_merchant_id="merchant-a",
        )

    with pytest.raises(DomainRuleViolation, match="not active"):
        assert_voucher_redeemable(
            now=now,
            expires_at=now + timedelta(hours=1),
            status="redeemed",
            signer_merchant_id="merchant-a",
            campaign_merchant_id="merchant-a",
        )

