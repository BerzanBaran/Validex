import base64
import binascii
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import base58
import jwt
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey


class InvalidWalletAddress(ValueError):
    pass


class InvalidWalletSignature(ValueError):
    pass


class InvalidAccessToken(ValueError):
    pass


def validate_solana_address(wallet_address: str) -> bytes:
    try:
        public_key = base58.b58decode(wallet_address)
    except ValueError as error:
        raise InvalidWalletAddress("Wallet address is not valid base58") from error
    if len(public_key) != 32:
        raise InvalidWalletAddress("Solana wallet address must decode to 32 bytes")
    return public_key


def create_auth_challenge(
    wallet_address: str,
    *,
    now: datetime,
    ttl_seconds: int,
) -> tuple[str, str, datetime]:
    validate_solana_address(wallet_address)
    nonce = secrets.token_urlsafe(32)
    expires_at = now + timedelta(seconds=ttl_seconds)
    message = "\n".join(
        (
            "Validex'e giriş yap",
            "",
            "Bu imza herhangi bir blockchain işlemi veya ödeme oluşturmaz.",
            f"Cüzdan: {wallet_address}",
            f"Nonce: {nonce}",
            f"Oluşturulma: {now.astimezone(UTC).isoformat()}",
            f"Son kullanma: {expires_at.astimezone(UTC).isoformat()}",
        )
    )
    return nonce, message, expires_at


def verify_wallet_signature(
    *,
    wallet_address: str,
    message: str,
    signature_base64: str,
) -> None:
    public_key = validate_solana_address(wallet_address)
    try:
        signature = base64.b64decode(signature_base64, validate=True)
    except (ValueError, binascii.Error) as error:
        raise InvalidWalletSignature("Signature is not valid base64") from error
    if len(signature) != 64:
        raise InvalidWalletSignature("Ed25519 signature must contain 64 bytes")
    try:
        VerifyKey(public_key).verify(message.encode("utf-8"), signature)
    except BadSignatureError as error:
        raise InvalidWalletSignature("Wallet signature is invalid") from error


def issue_access_token(
    *,
    user_id: uuid.UUID,
    wallet_address: str,
    role: str,
    secret: str,
    issuer: str,
    ttl_minutes: int,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=ttl_minutes)
    payload = {
        "sub": str(user_id),
        "wallet": wallet_address,
        "role": role,
        "iat": issued_at,
        "exp": expires_at,
        "iss": issuer,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, secret, algorithm="HS256"), expires_at


def decode_access_token(*, token: str, secret: str, issuer: str) -> dict[str, object]:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"], issuer=issuer)
    except jwt.PyJWTError as error:
        raise InvalidAccessToken("Access token is invalid or expired") from error
