"""Read-only checks before off-chain records reflect Solana escrow state."""

import base64
import hashlib
import struct

import base58
import httpx

from app.core.config import get_settings


class ChainVerificationError(ValueError):
    pass


def public_key_bytes(value: str) -> bytes:
    try:
        decoded = base58.b58decode(value)
    except ValueError as error:
        raise ChainVerificationError("Invalid Solana address") from error
    if len(decoded) != 32:
        raise ChainVerificationError("Invalid Solana address length")
    return decoded


async def account_data(address: str) -> bytes:
    settings = get_settings()
    if not settings.solana_program_id or not settings.usdc_mint:
        raise ChainVerificationError("Solana program and USDC mint are not configured")
    public_key_bytes(address)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                settings.solana_rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getAccountInfo",
                    "params": [address, {"encoding": "base64", "commitment": "finalized"}],
                },
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise ChainVerificationError("Solana RPC could not verify the account") from error
    if body.get("error"):
        raise ChainVerificationError("Solana RPC rejected the account lookup")
    result = body.get("result")
    value = result.get("value") if isinstance(result, dict) else None
    if not value or value.get("owner") != settings.solana_program_id:
        raise ChainVerificationError("Account is not owned by the Validex program")
    try:
        return base64.b64decode(value["data"][0], validate=True)
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise ChainVerificationError("Invalid Solana account data") from error


def discriminator(name: str) -> bytes:
    return hashlib.sha256(f"account:{name}".encode()).digest()[:8]


async def verify_campaign(
    *,
    address: str,
    merchant_wallet: str,
    metadata_hash: bytes,
    price_minor: int,
    stock: int,
    per_user_limit: int,
    starts_at: int,
    expires_at: int,
) -> None:
    campaign = await account_data(address)
    if len(campaign) < 180 or campaign[:8] != discriminator("Campaign"):
        raise ChainVerificationError("On-chain campaign account is invalid")
    if campaign[112:144] != metadata_hash:
        raise ChainVerificationError("Campaign metadata differs from on-chain hash")
    merchant_address = base58.b58encode(campaign[8:40]).decode("ascii")
    merchant = await account_data(merchant_address)
    if len(merchant) < 81 or merchant[:8] != discriminator("Merchant"):
        raise ChainVerificationError("On-chain merchant account is invalid")
    if merchant[8:40] != public_key_bytes(merchant_wallet) or campaign[40:72] != public_key_bytes(
        merchant_wallet
    ):
        raise ChainVerificationError("Campaign merchant wallet does not match")
    if campaign[72:104] != merchant[40:72]:
        raise ChainVerificationError("Campaign and merchant platforms differ")
    platform = await account_data(base58.b58encode(campaign[72:104]).decode("ascii"))
    if (
        len(platform) < 139
        or platform[:8] != discriminator("Platform")
        or platform[72:104] != public_key_bytes(get_settings().usdc_mint)
    ):
        raise ChainVerificationError("Platform USDC mint does not match")
    if (
        struct.unpack_from("<Q", campaign, 144)[0] != price_minor
        or struct.unpack_from("<I", campaign, 152)[0] != stock
        or struct.unpack_from("<H", campaign, 160)[0] != per_user_limit
        or struct.unpack_from("<q", campaign, 162)[0] != starts_at
        or struct.unpack_from("<q", campaign, 170)[0] != expires_at
        or campaign[178] != 0
    ):
        raise ChainVerificationError("Campaign terms differ from on-chain state")


async def verify_voucher(
    *,
    address: str,
    campaign_address: str,
    buyer_wallet: str,
    voucher_hash: bytes,
    expected_status: int,
) -> None:
    voucher = await account_data(address)
    if len(voucher) < 130 or voucher[:8] != discriminator("Voucher"):
        raise ChainVerificationError("On-chain voucher account is invalid")
    if (
        voucher[8:40] != public_key_bytes(campaign_address)
        or voucher[40:72] != public_key_bytes(buyer_wallet)
        or voucher[72:104] != voucher_hash
        or voucher[128] != expected_status
    ):
        raise ChainVerificationError("Voucher state differs from on-chain state")


async def verify_cancelled_campaign(address: str, merchant_wallet: str) -> None:
    campaign = await account_data(address)
    if (
        len(campaign) < 180
        or campaign[:8] != discriminator("Campaign")
        or campaign[40:72] != public_key_bytes(merchant_wallet)
        or campaign[178] != 1
    ):
        raise ChainVerificationError("Campaign is not cancelled on-chain")


async def verify_account_signature(address: str, signature: str) -> None:
    public_key_bytes(address)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                get_settings().solana_rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignaturesForAddress",
                    "params": [address, {"limit": 10, "commitment": "finalized"}],
                },
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise ChainVerificationError("Transaction signature could not be checked") from error
    recent = body.get("result")
    if (
        not isinstance(recent, list)
        or not recent
        or not isinstance(recent[0], dict)
        or recent[0].get("signature") != signature
        or recent[0].get("err") is not None
    ):
        raise ChainVerificationError("Transaction signature is not confirmed for this account")
