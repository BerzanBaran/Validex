use anchor_lang::prelude::*;

#[error_code]
pub enum ValidexError {
    #[msg("Commission exceeds 100 percent")]
    InvalidCommission,
    #[msg("Only the configured admin may initialize the platform")]
    UnauthorizedAdmin,
    #[msg("The payment mint must use six decimal places")]
    InvalidMintDecimals,
    #[msg("The supplied token program does not own the payment mint")]
    InvalidTokenProgram,
    #[msg("Price, stock and buyer limit must be positive")]
    InvalidCampaignTerms,
    #[msg("The campaign time window is invalid")]
    InvalidCampaignWindow,
    #[msg("The campaign is not open for purchase")]
    CampaignUnavailable,
    #[msg("The campaign stock is exhausted")]
    SoldOut,
    #[msg("The buyer has reached the per-wallet limit")]
    BuyerLimitReached,
    #[msg("The voucher is not active")]
    VoucherNotActive,
    #[msg("The voucher has expired")]
    VoucherExpired,
    #[msg("The voucher is not eligible for refund")]
    RefundNotAvailable,
    #[msg("The arithmetic operation overflowed")]
    ArithmeticOverflow,
    #[msg("The token account has the wrong owner")]
    WrongTokenOwner,
    #[msg("A merchant cannot purchase its own campaign")]
    SelfPurchase,
    #[msg("The payment mint applied a transfer fee or changed the expected amount")]
    UnexpectedTransferAmount,
}
