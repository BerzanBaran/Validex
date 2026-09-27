import struct

from app.domain.solana_chain import CampaignChainContext
from app.domain.transaction_proofs import (
    create_campaign_proof,
    purchase_proof,
    redeem_proof,
    refund_proof,
)

CONTEXT = CampaignChainContext(
    merchant="merchant-pda",
    authority="merchant-wallet",
    platform="platform-pda",
    treasury="treasury-wallet",
    mint="usdc-mint",
    token_program="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
)


def test_purchase_proof_binds_voucher_hash_and_full_usdc_amount() -> None:
    voucher_hash = bytes([7]) * 32
    proof = purchase_proof(
        CONTEXT,
        buyer="buyer",
        campaign="campaign",
        voucher="voucher",
        voucher_hash=voucher_hash,
        price_minor=5_000_000,
    )
    assert proof.data[8:] == voucher_hash
    assert proof.accounts[4] == "voucher"
    assert proof.transfers[0].amount == 5_000_000
    assert proof.token_owners == ((6, "buyer"), (7, "campaign"))


def test_redemption_proof_requires_both_signers_and_exact_split() -> None:
    proof = redeem_proof(
        CONTEXT,
        buyer="buyer",
        campaign="campaign",
        voucher="voucher",
        price_minor=5_000_000,
    )
    assert proof.signers == ("buyer", "merchant-wallet")
    assert proof.accounts[9] == "treasury-wallet"
    assert [(transfer.destination_index, transfer.amount) for transfer in proof.transfers] == [
        (10, 100_000),
        (8, 4_900_000),
    ]


def test_refund_proof_returns_full_amount_to_buyer() -> None:
    proof = refund_proof(
        CONTEXT,
        buyer="buyer",
        campaign="campaign",
        voucher="voucher",
        price_minor=5_000_000,
    )
    assert proof.transfers[0].amount == 5_000_000
    assert proof.signers == ("buyer",)
    assert proof.accounts[3] == "voucher"
    assert proof.transfers[0].source_index == 5
    assert proof.transfers[0].destination_index == 6
    assert len(proof.transfers) == 1
    assert proof.token_owners == ((5, "campaign"), (6, "buyer"))


def test_tiny_redemption_does_not_expect_zero_amount_commission_cpi() -> None:
    proof = redeem_proof(
        CONTEXT,
        buyer="buyer",
        campaign="campaign",
        voucher="voucher",
        price_minor=1,
    )
    assert [(transfer.destination_index, transfer.amount) for transfer in proof.transfers] == [
        (8, 1),
    ]


def test_campaign_creation_proof_encodes_exact_terms() -> None:
    proof = create_campaign_proof(
        CONTEXT,
        campaign_address="campaign",
        campaign_id="42",
        metadata_hash=bytes([9]) * 32,
        price_minor=5_000_000,
        stock=10,
        per_user_limit=1,
        starts_at=100,
        expires_at=200,
    )
    assert proof.accounts[3] == "campaign"
    assert struct.unpack("<Q32sQIHqq", proof.data[8:]) == (
        42,
        bytes([9]) * 32,
        5_000_000,
        10,
        1,
        100,
        200,
    )
