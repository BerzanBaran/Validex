"""Fail-closed verification of a Solana transaction before recording a marketplace event."""

import hashlib
from dataclasses import dataclass
from typing import Any, Literal

import base58
import httpx

from app.core.config import get_settings
from app.domain.solana_chain import ChainVerificationError, public_key_bytes

SYSTEM_PROGRAM = "11111111111111111111111111111111"
ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
TOKEN_PROGRAMS = {
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
}
type ChainStatus = Literal["pending", "confirmed", "finalized", "failed"]


@dataclass(frozen=True)
class Transfer:
    source_index: int
    destination_index: int
    authority_index: int
    amount: int


@dataclass(frozen=True)
class ExpectedTransaction:
    instruction: str
    accounts: tuple[str | None, ...]
    data: bytes
    signers: tuple[str, ...]
    token_program: str | None = None
    mint: str | None = None
    token_owners: tuple[tuple[int, str], ...] = ()
    transfers: tuple[Transfer, ...] = ()


def instruction_discriminator(name: str) -> bytes:
    return hashlib.sha256(f"global:{name}".encode()).digest()[:8]


def valid_signature(signature: str) -> None:
    try:
        decoded = base58.b58decode(signature)
    except ValueError as error:
        raise ChainVerificationError("Invalid transaction signature") from error
    if len(decoded) != 64:
        raise ChainVerificationError("Invalid transaction signature length")


async def rpc(method: str, params: list[Any]) -> Any:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                get_settings().solana_rpc_url,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise ChainVerificationError("Solana RPC could not verify the transaction") from error
    if not isinstance(body, dict) or body.get("error") or "result" not in body:
        raise ChainVerificationError("Solana RPC rejected the transaction lookup")
    return body["result"]


async def transaction_status(signature: str) -> ChainStatus:
    valid_signature(signature)
    result = await rpc("getSignatureStatuses", [[signature], {"searchTransactionHistory": True}])
    value = result.get("value") if isinstance(result, dict) else None
    if not isinstance(value, list) or len(value) != 1:
        raise ChainVerificationError("Invalid transaction status response")
    status = value[0]
    if status is None:
        return "pending"
    if not isinstance(status, dict):
        raise ChainVerificationError("Invalid transaction status response")
    if status.get("err") is not None:
        return "failed"
    confirmation = status.get("confirmationStatus")
    if confirmation in ("confirmed", "finalized"):
        return confirmation
    if confirmation == "processed":
        return "pending"
    raise ChainVerificationError("Unknown transaction confirmation status")


def _account_keys(message: dict[str, Any]) -> list[dict[str, Any]]:
    keys = message.get("accountKeys")
    if not isinstance(keys, list) or not all(
        isinstance(item, dict) and isinstance(item.get("pubkey"), str) for item in keys
    ):
        raise ChainVerificationError("Transaction account keys are unavailable")
    return keys


def _token_balance(
    balances: Any,
    keys: list[dict[str, Any]],
    address: str,
    mint: str,
    owner: str,
    program: str,
    *,
    allow_missing: bool = False,
) -> int:
    if not isinstance(balances, list):
        raise ChainVerificationError("Transaction token balances are unavailable")
    matching = [
        item
        for item in balances
        if isinstance(item, dict)
        and isinstance(item.get("accountIndex"), int)
        and 0 <= item["accountIndex"] < len(keys)
        and keys[item["accountIndex"]]["pubkey"] == address
    ]
    if not matching and allow_missing:
        return 0
    if len(matching) != 1:
        raise ChainVerificationError("Expected USDC token account is missing")
    item = matching[0]
    token_amount = item.get("uiTokenAmount")
    if (
        item.get("mint") != mint
        or item.get("owner") != owner
        or item.get("programId") != program
        or not isinstance(token_amount, dict)
        or token_amount.get("decimals") != 6
    ):
        raise ChainVerificationError("Token mint, owner or program differs")
    amount = token_amount.get("amount")
    if not isinstance(amount, str) or not amount.isdecimal():
        raise ChainVerificationError("Invalid token amount in transaction")
    return int(amount)


def verify_transaction_body(
    signature: str, result: dict[str, Any], expected: ExpectedTransaction
) -> None:
    if not isinstance(result, dict):
        raise ChainVerificationError("Transaction body is unavailable")
    meta = result.get("meta")
    transaction = result.get("transaction")
    if (
        not isinstance(meta, dict)
        or meta.get("err") is not None
        or not isinstance(transaction, dict)
    ):
        raise ChainVerificationError("Transaction failed or has no metadata")
    signatures = transaction.get("signatures")
    if not isinstance(signatures, list) or not signatures or signatures[0] != signature:
        raise ChainVerificationError("Transaction signature does not match the RPC body")
    message = transaction.get("message")
    if not isinstance(message, dict):
        raise ChainVerificationError("Transaction message is unavailable")
    keys = _account_keys(message)
    for signer in expected.signers:
        if not any(key["pubkey"] == signer and key.get("signer") is True for key in keys):
            raise ChainVerificationError("Required wallet did not sign the transaction")

    instructions = message.get("instructions")
    if not isinstance(instructions, list) or len(instructions) != 1:
        raise ChainVerificationError("Transaction contains unexpected top-level instructions")
    instruction = instructions[0]
    if (
        not isinstance(instruction, dict)
        or instruction.get("programId") != get_settings().solana_program_id
    ):
        raise ChainVerificationError("Transaction did not call the configured Validex program")
    accounts = instruction.get("accounts")
    if not isinstance(accounts, list) or len(accounts) != len(expected.accounts):
        raise ChainVerificationError("Validex instruction account count differs")
    if any(
        actual != required
        for actual, required in zip(accounts, expected.accounts, strict=True)
        if required is not None
    ):
        raise ChainVerificationError("Validex instruction accounts differ")
    try:
        data = base58.b58decode(instruction["data"])
    except (KeyError, TypeError, ValueError) as error:
        raise ChainVerificationError("Invalid Validex instruction data") from error
    if data != expected.data or data[:8] != instruction_discriminator(expected.instruction):
        raise ChainVerificationError("Validex instruction data differs")

    if not expected.transfers:
        for group in meta.get("innerInstructions") or []:
            if not isinstance(group, dict):
                raise ChainVerificationError("Invalid inner instruction group")
            for inner in group.get("instructions", []):
                if not isinstance(inner, dict):
                    raise ChainVerificationError("Invalid inner instruction")
                parsed = inner.get("parsed")
                if (
                    inner.get("programId") in TOKEN_PROGRAMS
                    and isinstance(parsed, dict)
                    and parsed.get("type") in ("transfer", "transferChecked")
                ):
                    raise ChainVerificationError("Unexpected USDC transfer")
        return
    if expected.token_program not in TOKEN_PROGRAMS or not expected.mint:
        raise ChainVerificationError("Expected USDC mint and token program are missing")
    public_key_bytes(expected.mint)
    inner_groups = meta.get("innerInstructions")
    if not isinstance(inner_groups, list):
        raise ChainVerificationError("Token transfer evidence is unavailable")
    token_transfers: list[dict[str, Any]] = []
    for group in inner_groups:
        if not isinstance(group, dict) or group.get("index") != 0:
            raise ChainVerificationError("Unexpected inner instruction group")
        for inner in group.get("instructions", []):
            if not isinstance(inner, dict):
                raise ChainVerificationError("Invalid inner instruction")
            if inner.get("programId") not in TOKEN_PROGRAMS:
                continue
            parsed = inner.get("parsed")
            if isinstance(parsed, dict) and parsed.get("type") in ("transfer", "transferChecked"):
                if (
                    inner["programId"] != expected.token_program
                    or parsed["type"] != "transferChecked"
                ):
                    raise ChainVerificationError("Unexpected token transfer")
                token_transfers.append(parsed.get("info"))
    if len(token_transfers) != len(expected.transfers):
        raise ChainVerificationError("USDC transfer count differs")
    for actual, transfer in zip(token_transfers, expected.transfers, strict=True):
        if not isinstance(actual, dict):
            raise ChainVerificationError("USDC transfer is not parsed")
        token_amount = actual.get("tokenAmount")
        if (
            actual.get("source") != accounts[transfer.source_index]
            or actual.get("destination") != accounts[transfer.destination_index]
            or actual.get("authority") != accounts[transfer.authority_index]
            or actual.get("mint") != expected.mint
            or not isinstance(token_amount, dict)
            or token_amount.get("amount") != str(transfer.amount)
            or token_amount.get("decimals") != 6
        ):
            raise ChainVerificationError("USDC transfer mint, accounts or amount differ")
    deltas: dict[str, int] = {}
    for transfer in expected.transfers:
        source = accounts[transfer.source_index]
        destination = accounts[transfer.destination_index]
        deltas[source] = deltas.get(source, 0) - transfer.amount
        deltas[destination] = deltas.get(destination, 0) + transfer.amount
    checked: dict[str, str] = {}
    for index, owner in expected.token_owners:
        if index >= len(accounts):
            raise ChainVerificationError("Token account index is invalid")
        address = accounts[index]
        if address in checked:
            if checked[address] != owner:
                raise ChainVerificationError("Token account has conflicting expected owners")
            continue
        checked[address] = owner
        post = _token_balance(
            meta.get("postTokenBalances"),
            keys,
            address,
            expected.mint,
            owner,
            expected.token_program,
        )
        pre = _token_balance(
            meta.get("preTokenBalances"),
            keys,
            address,
            expected.mint,
            owner,
            expected.token_program,
            allow_missing=True,
        )
        if post - pre != deltas.get(address, 0):
            raise ChainVerificationError("USDC balance change differs from expected transfer")


async def verify_transaction(signature: str, expected: ExpectedTransaction) -> None:
    status = await transaction_status(signature)
    if status != "finalized":
        raise ChainVerificationError(f"Transaction is {status}, not finalized")
    result = await rpc(
        "getTransaction",
        [
            signature,
            {
                "encoding": "jsonParsed",
                "commitment": "finalized",
                "maxSupportedTransactionVersion": 0,
            },
        ],
    )
    verify_transaction_body(signature, result, expected)
