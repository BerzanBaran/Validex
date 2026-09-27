use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::{BuyerCounter, Campaign, Merchant, Platform, Voucher};

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Treasury is a destination wallet; no data is read from this account.
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Platform::INIT_SPACE,
        seeds = [b"platform"],
        bump,
    )]
    pub platform: Account<'info, Platform>,
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterMerchant<'info> {
    #[account(mut, address = platform.admin)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    /// CHECK: Wallet public key is recorded as the merchant authority.
    pub merchant_wallet: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Merchant::INIT_SPACE,
        seeds = [b"merchant", merchant_wallet.key().as_ref()],
        bump,
    )]
    pub merchant: Account<'info, Merchant>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        seeds = [b"merchant", authority.key().as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key(),
        constraint = merchant.platform == platform.key(),
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        init,
        payer = authority,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [b"campaign", merchant.key().as_ref(), &campaign_id.to_le_bytes()],
        bump,
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(address = platform.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = payment_mint,
        associated_token::authority = campaign,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(address = platform.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(voucher_hash: [u8; 32])]
pub struct PurchaseVoucher<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.merchant.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump,
        constraint = campaign.platform == platform.key(),
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + BuyerCounter::INIT_SPACE,
        seeds = [b"buyer", campaign.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub buyer_counter: Account<'info, BuyerCounter>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Voucher::INIT_SPACE,
        seeds = [b"voucher", campaign.key().as_ref(), voucher_hash.as_ref()],
        bump,
    )]
    pub voucher: Account<'info, Voucher>,
    #[account(address = platform.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = campaign,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(address = platform.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelCampaign<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"merchant", authority.key().as_ref()],
        bump = merchant.bump,
        constraint = merchant.authority == authority.key(),
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        mut,
        seeds = [b"campaign", merchant.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump,
        constraint = campaign.merchant == merchant.key(),
    )]
    pub campaign: Account<'info, Campaign>,
}

#[derive(Accounts)]
pub struct RefundVoucher<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        seeds = [b"campaign", campaign.merchant.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump,
        constraint = campaign.platform == platform.key(),
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        mut,
        seeds = [b"voucher", campaign.key().as_ref(), voucher.voucher_hash.as_ref()],
        bump = voucher.bump,
        constraint = voucher.campaign == campaign.key(),
        constraint = voucher.buyer == buyer.key(),
    )]
    pub voucher: Account<'info, Voucher>,
    #[account(address = platform.payment_mint)]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = campaign,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = payment_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(address = platform.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
