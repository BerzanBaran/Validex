import base64
import uuid
from datetime import UTC, datetime

import base58
import jwt
import pytest
from nacl.signing import SigningKey

from app.domain.auth import (
    InvalidWalletAddress,
    InvalidWalletSignature,
    create_auth_challenge,
    decode_access_token,
    issue_access_token,
    validate_solana_address,
    verify_wallet_signature,
)


def wallet_fixture() -> tuple[SigningKey, str]:
    signing_key = SigningKey.generate()
    wallet_address = base58.b58encode(signing_key.verify_key.encode()).decode("ascii")
    return signing_key, wallet_address


def test_challenge_can_be_verified_by_owning_wallet() -> None:
    signing_key, wallet_address = wallet_fixture()
    _, message, _ = create_auth_challenge(
        wallet_address,
        now=datetime(2026, 9, 26, 18, 0, tzinfo=UTC),
        ttl_seconds=300,
    )
    signature = signing_key.sign(message.encode("utf-8")).signature

    verify_wallet_signature(
        wallet_address=wallet_address,
        message=message,
        signature_base64=base64.b64encode(signature).decode("ascii"),
    )


def test_signature_cannot_be_replayed_for_modified_message() -> None:
    signing_key, wallet_address = wallet_fixture()
    signature = signing_key.sign(b"original message").signature

    with pytest.raises(InvalidWalletSignature, match="invalid"):
        verify_wallet_signature(
            wallet_address=wallet_address,
            message="modified message",
            signature_base64=base64.b64encode(signature).decode("ascii"),
        )


def test_invalid_solana_address_is_rejected() -> None:
    with pytest.raises(InvalidWalletAddress):
        validate_solana_address("not-a-solana-address")


def test_access_token_contains_wallet_role_and_expiry() -> None:
    _, wallet_address = wallet_fixture()
    now = datetime.now(UTC)
    user_id = uuid.uuid4()
    secret = "test-secret-with-at-least-thirty-two-characters"

    token, expires_at = issue_access_token(
        user_id=user_id,
        wallet_address=wallet_address,
        role="customer",
        secret=secret,
        issuer="validex-test",
        ttl_minutes=15,
        now=now,
    )
    payload = jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        issuer="validex-test",
        options={"verify_exp": False},
    )

    assert payload["sub"] == str(user_id)
    assert payload["wallet"] == wallet_address
    assert payload["role"] == "customer"
    assert expires_at > now

    verified_payload = decode_access_token(
        token=token,
        secret=secret,
        issuer="validex-test",
    )
    assert verified_payload["sub"] == str(user_id)
