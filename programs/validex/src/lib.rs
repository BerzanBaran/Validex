use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TransferChecked};

mod contexts;
mod error;
mod math;
mod rules;
mod state;

use contexts::*;
use error::ValidexError;
use math::split_payment;
use rules::{assert_cancellable, assert_purchasable, assert_redeemable, assert_refundable};
use state::*;

declare_id!("F49cTqvPrtcdH4PAi5FcxqzTDG7xFoHS1DVTL8Xadaqe");

// Embedded at build time. A missing or invalid address disables initialization.
fn configured_admin() -> Result<Pubkey> {
    let address = option_env!("VALIDEX_ADMIN_WALLET")
        .ok_or(ValidexError::UnauthorizedAdmin)?;
    address.parse().map_err(|_| error!(ValidexError::UnauthorizedAdmin))
}

#[program]
pub mod validex {
    use super::*;

    pub fn initialize_platform(ctx: Context<InitializePlatform>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.admin.key(),
            configured_admin()?,
            ValidexError::UnauthorizedAdmin
        );
        require_eq!(
            ctx.accounts.payment_mint.decimals,
            6,
            ValidexError::InvalidMintDecimals
        );
        require_keys_eq!(
            *ctx.accounts.payment_mint.to_account_info().owner,
            ctx.accounts.token_program.key(),
            ValidexError::InvalidTokenProgram
        );

        let platform = &mut ctx.accounts.platform;
        platform.admin = ctx.accounts.admin.key();
        platform.treasury = ctx.accounts.treasury.key();
        platform.payment_mint = ctx.accounts.payment_mint.key();
        platform.token_program = ctx.accounts.token_program.key();
        platform.commission_bps = COMMISSION_BPS;
        platform.bump = ctx.bumps.platform;
        Ok(())
    }

    pub fn register_merchant(ctx: Context<RegisterMerchant>) -> Result<()> {
        let merchant = &mut ctx.accounts.merchant;
        merchant.authority = ctx.accounts.merchant_wallet.key();
        merchant.platform = ctx.accounts.platform.key();
        merchant.registered_at = Clock::get()?.unix_timestamp;
        merchant.bump = ctx.bumps.merchant;
        Ok(())
    }

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: u64,
        metadata_hash: [u8; 32],
        price_minor: u64,
        stock: u32,
        per_user_limit: u16,
        starts_at: i64,
        expires_at: i64,
    ) -> Result<()> {
        require!(
            price_minor > 0 && stock > 0 && per_user_limit > 0,
            ValidexError::InvalidCampaignTerms
        );
        require!(
            starts_at < expires_at && expires_at > Clock::get()?.unix_timestamp,
            ValidexError::InvalidCampaignWindow
        );
        let campaign = &mut ctx.accounts.campaign;
        campaign.merchant = ctx.accounts.merchant.key();
        campaign.authority = ctx.accounts.authority.key();
        campaign.platform = ctx.accounts.platform.key();
        campaign.campaign_id = campaign_id;
        campaign.metadata_hash = metadata_hash;
        campaign.price_minor = price_minor;
        campaign.stock = stock;
        campaign.sold_count = 0;
        campaign.per_user_limit = per_user_limit;
        campaign.starts_at = starts_at;
        campaign.expires_at = expires_at;
        campaign.cancelled = false;
        campaign.bump = ctx.bumps.campaign;
        Ok(())
    }

    pub fn purchase_voucher(ctx: Context<PurchaseVoucher>, voucher_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let campaign = &mut ctx.accounts.campaign;
        require_keys_neq!(
            ctx.accounts.buyer.key(),
            campaign.authority,
            ValidexError::SelfPurchase
        );

        let counter = &mut ctx.accounts.buyer_counter;
        if counter.campaign == Pubkey::default() {
            counter.campaign = campaign.key();
            counter.buyer = ctx.accounts.buyer.key();
            counter.bump = ctx.bumps.buyer_counter;
        } else {
            require_keys_eq!(counter.campaign, campaign.key());
            require_keys_eq!(counter.buyer, ctx.accounts.buyer.key());
        }
        assert_purchasable(campaign, now, counter.count)?;

        let transfer = TransferChecked {
            from: ctx.accounts.buyer_token.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let escrow_before = ctx.accounts.escrow.amount;
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), transfer),
            campaign.price_minor,
            ctx.accounts.payment_mint.decimals,
        )?;
        ctx.accounts.escrow.reload()?;
        let escrow_received = ctx
            .accounts
            .escrow
            .amount
            .checked_sub(escrow_before)
            .ok_or(ValidexError::ArithmeticOverflow)?;
        require_eq!(
            escrow_received,
            campaign.price_minor,
            ValidexError::UnexpectedTransferAmount
        );

        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(ValidexError::ArithmeticOverflow)?;
        campaign.sold_count = campaign
            .sold_count
            .checked_add(1)
            .ok_or(ValidexError::ArithmeticOverflow)?;

        let voucher = &mut ctx.accounts.voucher;
        voucher.campaign = campaign.key();
        voucher.buyer = ctx.accounts.buyer.key();
        voucher.voucher_hash = voucher_hash;
        voucher.price_minor = campaign.price_minor;
        voucher.purchased_at = now;
        voucher.expires_at = campaign.expires_at;
        voucher.status = VoucherStatus::Active;
        voucher.bump = ctx.bumps.voucher;

        emit!(VoucherPurchased {
            campaign: campaign.key(),
            voucher: voucher.key(),
            buyer: voucher.buyer,
            voucher_hash,
            amount: voucher.price_minor,
        });
        Ok(())
    }

    pub fn cancel_campaign(ctx: Context<CancelCampaign>) -> Result<()> {
        assert_cancellable(&ctx.accounts.campaign)?;
        ctx.accounts.campaign.cancelled = true;
        Ok(())
    }

    pub fn redeem_voucher(ctx: Context<RedeemVoucher>) -> Result<()> {
        let campaign = &ctx.accounts.campaign;
        require!(!campaign.cancelled, ValidexError::CampaignUnavailable);
        let voucher = &mut ctx.accounts.voucher;
        assert_redeemable(voucher, Clock::get()?.unix_timestamp)?;
        let split = split_payment(voucher.price_minor, ctx.accounts.platform.commission_bps)?;

        let campaign_id_bytes = campaign.campaign_id.to_le_bytes();
        let bump = [campaign.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"campaign",
            campaign.merchant.as_ref(),
            &campaign_id_bytes,
            &bump,
        ]];
        if split.commission > 0 {
            let treasury_before = ctx.accounts.treasury_token.amount;
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.escrow.to_account_info(),
                        mint: ctx.accounts.payment_mint.to_account_info(),
                        to: ctx.accounts.treasury_token.to_account_info(),
                        authority: campaign.to_account_info(),
                    },
                    signer_seeds,
                ),
                split.commission,
                ctx.accounts.payment_mint.decimals,
            )?;
            ctx.accounts.treasury_token.reload()?;
            require_eq!(
                ctx.accounts
                    .treasury_token
                    .amount
                    .checked_sub(treasury_before)
                    .ok_or(ValidexError::ArithmeticOverflow)?,
                split.commission,
                ValidexError::UnexpectedTransferAmount
            );
        }

        // Reload in case treasury and merchant resolve to the same token account.
        ctx.accounts.merchant_token.reload()?;
        let merchant_before = ctx.accounts.merchant_token.amount;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.merchant_token.to_account_info(),
                    authority: campaign.to_account_info(),
                },
                signer_seeds,
            ),
            split.merchant,
            ctx.accounts.payment_mint.decimals,
        )?;
        ctx.accounts.merchant_token.reload()?;
        require_eq!(
            ctx.accounts
                .merchant_token
                .amount
                .checked_sub(merchant_before)
                .ok_or(ValidexError::ArithmeticOverflow)?,
            split.merchant,
            ValidexError::UnexpectedTransferAmount
        );

        voucher.status = VoucherStatus::Redeemed;
        emit!(VoucherRedeemed {
            campaign: campaign.key(),
            voucher: voucher.key(),
            merchant_amount: split.merchant,
            commission_amount: split.commission,
        });
        Ok(())
    }

    pub fn refund_voucher(ctx: Context<RefundVoucher>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let campaign = &ctx.accounts.campaign;
        let voucher = &mut ctx.accounts.voucher;
        assert_refundable(campaign, voucher, now)?;

        let campaign_id_bytes = campaign.campaign_id.to_le_bytes();
        let bump = [campaign.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"campaign",
            campaign.merchant.as_ref(),
            &campaign_id_bytes,
            &bump,
        ]];
        let transfer = TransferChecked {
            from: ctx.accounts.escrow.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.buyer_token.to_account_info(),
            authority: campaign.to_account_info(),
        };
        let buyer_before = ctx.accounts.buyer_token.amount;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(ctx.accounts.token_program.key(), transfer, signer_seeds),
            voucher.price_minor,
            ctx.accounts.payment_mint.decimals,
        )?;
        ctx.accounts.buyer_token.reload()?;
        let buyer_received = ctx
            .accounts
            .buyer_token
            .amount
            .checked_sub(buyer_before)
            .ok_or(ValidexError::ArithmeticOverflow)?;
        require_eq!(
            buyer_received,
            voucher.price_minor,
            ValidexError::UnexpectedTransferAmount
        );
        voucher.status = VoucherStatus::Refunded;
        emit!(VoucherRefunded {
            campaign: campaign.key(),
            voucher: voucher.key(),
            buyer: voucher.buyer,
            amount: voucher.price_minor,
        });
        Ok(())
    }
}
