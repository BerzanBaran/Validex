use anchor_lang::prelude::*;

pub const COMMISSION_BPS: u16 = 200;
pub const BPS_DENOMINATOR: u64 = 10_000;

#[account]
#[derive(InitSpace)]
pub struct Platform {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub payment_mint: Pubkey,
    pub token_program: Pubkey,
    pub commission_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Merchant {
    pub authority: Pubkey,
    pub platform: Pubkey,
    pub registered_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub merchant: Pubkey,
    pub authority: Pubkey,
    pub platform: Pubkey,
    pub campaign_id: u64,
    pub metadata_hash: [u8; 32],
    pub price_minor: u64,
    pub stock: u32,
    pub sold_count: u32,
    pub per_user_limit: u16,
    pub starts_at: i64,
    pub expires_at: i64,
    pub cancelled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BuyerCounter {
    pub campaign: Pubkey,
    pub buyer: Pubkey,
    pub count: u16,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VoucherStatus {
    Active,
    Redeemed,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct Voucher {
    pub campaign: Pubkey,
    pub buyer: Pubkey,
    pub voucher_hash: [u8; 32],
    pub price_minor: u64,
    pub purchased_at: i64,
    pub expires_at: i64,
    pub status: VoucherStatus,
    pub bump: u8,
}

#[event]
pub struct VoucherPurchased {
    pub campaign: Pubkey,
    pub voucher: Pubkey,
    pub buyer: Pubkey,
    pub voucher_hash: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct VoucherRedeemed {
    pub campaign: Pubkey,
    pub voucher: Pubkey,
    pub merchant_amount: u64,
    pub commission_amount: u64,
}

#[event]
pub struct VoucherRefunded {
    pub campaign: Pubkey,
    pub voucher: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
}
