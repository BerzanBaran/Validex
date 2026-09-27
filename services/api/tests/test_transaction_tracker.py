import asyncio
from copy import deepcopy

import base58
import pytest

from app.domain.solana_chain import ChainVerificationError
from app.domain.transaction_tracker import (
    ExpectedTransaction,
    Transfer,
    instruction_discriminator,
    transaction_status,
    verify_transaction,
    verify_transaction_body,
)


def address(byte: int) -> str:
    return base58.b58encode(bytes([byte]) * 32).decode("ascii")


SIGNATURE = base58.b58encode(bytes([17]) * 64).decode("ascii")
PROGRAM = address(18)
BUYER = address(1)
PLATFORM = address(2)
CAMPAIGN = address(3)
COUNTER = address(4)
VOUCHER = address(5)
MINT = address(6)
BUYER_TOKEN = address(7)
ESCROW = address(8)
TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
SYSTEM_PROGRAM = "11111111111111111111111111111111"
HASH = bytes([9]) * 32


def expected() -> ExpectedTransaction:
    return ExpectedTransaction(
        instruction="purchase_voucher",
        accounts=(
            BUYER,
            PLATFORM,
            CAMPAIGN,
            COUNTER,
            VOUCHER,
            MINT,
            BUYER_TOKEN,
            ESCROW,
            TOKEN_PROGRAM,
            SYSTEM_PROGRAM,
        ),
        data=instruction_discriminator("purchase_voucher") + HASH,
        signers=(BUYER,),
        token_program=TOKEN_PROGRAM,
        mint=MINT,
        token_owners=((6, BUYER), (7, CAMPAIGN)),
        transfers=(Transfer(6, 7, 0, 5_000_000),),
    )


def token_balance(index: int, owner: str, amount: str) -> dict:
    return {
        "accountIndex": index,
        "mint": MINT,
        "owner": owner,
        "programId": TOKEN_PROGRAM,
        "uiTokenAmount": {"amount": amount, "decimals": 6},
    }


def transaction() -> dict:
    proof = expected()
    return {
        "meta": {
            "err": None,
            "innerInstructions": [
                {
                    "index": 0,
                    "instructions": [
                        {
                            "programId": TOKEN_PROGRAM,
                            "parsed": {
                                "type": "transferChecked",
                                "info": {
                                    "source": BUYER_TOKEN,
                                    "destination": ESCROW,
                                    "authority": BUYER,
                                    "mint": MINT,
                                    "tokenAmount": {"amount": "5000000", "decimals": 6},
                                },
                            },
                        }
                    ],
                }
            ],
            "preTokenBalances": [
                token_balance(6, BUYER, "10000000"),
                token_balance(7, CAMPAIGN, "0"),
            ],
            "postTokenBalances": [
                token_balance(6, BUYER, "5000000"),
                token_balance(7, CAMPAIGN, "5000000"),
            ],
        },
        "transaction": {
            "signatures": [SIGNATURE],
            "message": {
                "accountKeys": [{"pubkey": key, "signer": key == BUYER} for key in proof.accounts],
                "instructions": [
                    {
                        "programId": PROGRAM,
                        "accounts": list(proof.accounts),
                        "data": base58.b58encode(proof.data).decode("ascii"),
                    }
                ],
            },
        },
    }


@pytest.fixture(autouse=True)
def configured_program(monkeypatch: pytest.MonkeyPatch) -> None:
    class Settings:
        solana_program_id = PROGRAM

    monkeypatch.setattr("app.domain.transaction_tracker.get_settings", lambda: Settings())


def test_purchase_proof_accepts_matching_program_accounts_mint_and_amount() -> None:
    verify_transaction_body(SIGNATURE, transaction(), expected())


@pytest.mark.parametrize(
    "mutation",
    [
        "program",
        "account",
        "data",
        "mint",
        "amount",
        "owner",
        "balance",
        "signer",
        "failed",
        "extra_instruction",
        "extra_transfer",
    ],
)
def test_purchase_proof_rejects_wrong_transaction(mutation: str) -> None:
    altered = deepcopy(transaction())
    instruction = altered["transaction"]["message"]["instructions"][0]
    transfer = altered["meta"]["innerInstructions"][0]["instructions"][0]["parsed"]["info"]
    if mutation == "program":
        instruction["programId"] = address(20)
    elif mutation == "account":
        instruction["accounts"][4] = address(21)
    elif mutation == "data":
        instruction["data"] = "11111111"
    elif mutation == "mint":
        transfer["mint"] = address(22)
    elif mutation == "amount":
        transfer["tokenAmount"]["amount"] = "1"
    elif mutation == "owner":
        altered["meta"]["postTokenBalances"][1]["owner"] = address(23)
    elif mutation == "balance":
        altered["meta"]["postTokenBalances"][1]["uiTokenAmount"]["amount"] = "1"
    elif mutation == "signer":
        altered["transaction"]["message"]["accountKeys"][0]["signer"] = False
    elif mutation == "extra_instruction":
        altered["transaction"]["message"]["instructions"].append(deepcopy(instruction))
    elif mutation == "extra_transfer":
        altered["meta"]["innerInstructions"][0]["instructions"].append(
            deepcopy(altered["meta"]["innerInstructions"][0]["instructions"][0])
        )
    else:
        altered["meta"]["err"] = {"InstructionError": [0, "Custom"]}
    with pytest.raises(ChainVerificationError):
        verify_transaction_body(SIGNATURE, altered, expected())


@pytest.mark.parametrize(
    ("rpc_status", "expected_status"),
    [
        (None, "pending"),
        ({"err": None, "confirmationStatus": "processed"}, "pending"),
        ({"err": None, "confirmationStatus": "confirmed"}, "confirmed"),
        ({"err": None, "confirmationStatus": "finalized"}, "finalized"),
        ({"err": {"InstructionError": [0, "Custom"]}, "confirmationStatus": "finalized"}, "failed"),
    ],
)
def test_rpc_confirmation_states(monkeypatch, rpc_status, expected_status) -> None:
    async def fake_rpc(method, params):
        assert method == "getSignatureStatuses"
        assert params[1]["searchTransactionHistory"] is True
        return {"value": [rpc_status]}

    monkeypatch.setattr("app.domain.transaction_tracker.rpc", fake_rpc)
    assert asyncio.run(transaction_status(SIGNATURE)) == expected_status


def test_confirmation_is_not_recordable_until_finalized(monkeypatch) -> None:
    async def fake_rpc(method, _params):
        if method == "getSignatureStatuses":
            return {"value": [{"err": None, "confirmationStatus": "confirmed"}]}
        raise AssertionError("getTransaction must not run before finalization")

    monkeypatch.setattr("app.domain.transaction_tracker.rpc", fake_rpc)
    with pytest.raises(ChainVerificationError, match="not finalized"):
        asyncio.run(verify_transaction(SIGNATURE, expected()))
