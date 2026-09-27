"""Expected Anchor account order and USDC transfers for each Validex action."""

import struct

from app.domain.solana_chain import CampaignChainContext, ChainVerificationError
from app.domain.transaction_tracker import (
    ASSOCIATED_TOKEN_PROGRAM,
    SYSTEM_PROGRAM,
    ExpectedTransaction,
    Transfer,
    instruction_discriminator,
)
from app.domain.vouchers import calculate_payment_split


def create_campaign_proof(
    context: CampaignChainContext,
    *,
    campaign_address: str,
    campaign_id: str,
    metadata_hash: bytes,
    price_minor: int,
    stock: int,
    per_user_limit: int,
    starts_at: int,
    expires_at: int,
) -> ExpectedTransaction:
    try:
        numeric_id = int(campaign_id)
        data = instruction_discriminator("create_campaign") + struct.pack(
            "<Q32sQIHqq",
            numeric_id,
            metadata_hash,
            price_minor,
            stock,
            per_user_limit,
            starts_at,
            expires_at,
        )
    except (ValueError, struct.error) as error:
        raise ChainVerificationError("Invalid on-chain campaign terms") from error
    return ExpectedTransaction(
        instruction="create_campaign",
        accounts=(
            context.authority,
            context.platform,
            context.merchant,
            campaign_address,
            context.mint,
            None,
            context.token_program,
            ASSOCIATED_TOKEN_PROGRAM,
            SYSTEM_PROGRAM,
        ),
        data=data,
        signers=(context.authority,),
    )


def cancel_campaign_proof(
    context: CampaignChainContext, campaign_address: str
) -> ExpectedTransaction:
    return ExpectedTransaction(
        instruction="cancel_campaign",
        accounts=(context.authority, context.merchant, campaign_address),
        data=instruction_discriminator("cancel_campaign"),
        signers=(context.authority,),
    )


def purchase_proof(
    context: CampaignChainContext,
    *,
    buyer: str,
    campaign: str,
    voucher: str,
    voucher_hash: bytes,
    price_minor: int,
) -> ExpectedTransaction:
    return ExpectedTransaction(
        instruction="purchase_voucher",
        accounts=(
            buyer,
            context.platform,
            campaign,
            None,
            voucher,
            context.mint,
            None,
            None,
            context.token_program,
            SYSTEM_PROGRAM,
        ),
        data=instruction_discriminator("purchase_voucher") + voucher_hash,
        signers=(buyer,),
        token_program=context.token_program,
        mint=context.mint,
        token_owners=((6, buyer), (7, campaign)),
        transfers=(Transfer(6, 7, 0, price_minor),),
    )


def redeem_proof(
    context: CampaignChainContext,
    *,
    buyer: str,
    campaign: str,
    voucher: str,
    price_minor: int,
) -> ExpectedTransaction:
    split = calculate_payment_split(price_minor, 200)
    transfers = (
        (Transfer(7, 10, 4, split.commission_amount),) if split.commission_amount else ()
    ) + (Transfer(7, 8, 4, split.merchant_amount),)
    return ExpectedTransaction(
        instruction="redeem_voucher",
        accounts=(
            buyer,
            context.authority,
            context.platform,
            context.merchant,
            campaign,
            voucher,
            context.mint,
            None,
            None,
            context.treasury,
            None,
            context.token_program,
            ASSOCIATED_TOKEN_PROGRAM,
            SYSTEM_PROGRAM,
        ),
        data=instruction_discriminator("redeem_voucher"),
        signers=(buyer, context.authority),
        token_program=context.token_program,
        mint=context.mint,
        token_owners=((7, campaign), (8, context.authority), (10, context.treasury)),
        transfers=transfers,
    )


def refund_proof(
    context: CampaignChainContext,
    *,
    buyer: str,
    campaign: str,
    voucher: str,
    price_minor: int,
) -> ExpectedTransaction:
    return ExpectedTransaction(
        instruction="refund_voucher",
        accounts=(
            buyer,
            context.platform,
            campaign,
            voucher,
            context.mint,
            None,
            None,
            context.token_program,
            ASSOCIATED_TOKEN_PROGRAM,
            SYSTEM_PROGRAM,
        ),
        data=instruction_discriminator("refund_voucher"),
        signers=(buyer,),
        token_program=context.token_program,
        mint=context.mint,
        token_owners=((5, campaign), (6, buyer)),
        transfers=(Transfer(5, 6, 2, price_minor),),
    )
