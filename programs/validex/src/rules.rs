use anchor_lang::prelude::*;

use crate::error::ValidexError;
use crate::state::{Campaign, Voucher, VoucherStatus};

pub fn assert_purchasable(campaign: &Campaign, now: i64, buyer_count: u16) -> Result<()> {
    require!(
        !campaign.cancelled && now >= campaign.starts_at && now < campaign.expires_at,
        ValidexError::CampaignUnavailable
    );
    require!(campaign.sold_count < campaign.stock, ValidexError::SoldOut);
    require!(
        buyer_count < campaign.per_user_limit,
        ValidexError::BuyerLimitReached
    );
    Ok(())
}

pub fn assert_refundable(campaign: &Campaign, voucher: &Voucher, now: i64) -> Result<()> {
    require!(
        voucher.status == VoucherStatus::Active,
        ValidexError::VoucherNotActive
    );
    require!(
        campaign.cancelled || now >= voucher.expires_at,
        ValidexError::RefundNotAvailable
    );
    Ok(())
}

pub fn assert_redeemable(voucher: &Voucher, now: i64) -> Result<()> {
    require!(
        voucher.status == VoucherStatus::Active,
        ValidexError::VoucherNotActive
    );
    require!(now < voucher.expires_at, ValidexError::VoucherExpired);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn campaign() -> Campaign {
        Campaign {
            merchant: Pubkey::new_unique(),
            authority: Pubkey::new_unique(),
            platform: Pubkey::new_unique(),
            campaign_id: 1,
            metadata_hash: [1; 32],
            price_minor: 5_000_000,
            stock: 2,
            sold_count: 0,
            per_user_limit: 1,
            starts_at: 100,
            expires_at: 200,
            cancelled: false,
            bump: 1,
        }
    }

    fn voucher() -> Voucher {
        Voucher {
            campaign: Pubkey::new_unique(),
            buyer: Pubkey::new_unique(),
            voucher_hash: [2; 32],
            price_minor: 5_000_000,
            purchased_at: 120,
            expires_at: 200,
            status: VoucherStatus::Active,
            bump: 1,
        }
    }

    #[test]
    fn purchase_checks_stock_limit_and_time() {
        assert!(assert_purchasable(&campaign(), 150, 0).is_ok());
        let mut sold_out = campaign();
        sold_out.sold_count = sold_out.stock;
        assert!(assert_purchasable(&sold_out, 150, 0).is_err());
        assert!(assert_purchasable(&campaign(), 150, 1).is_err());
        assert!(assert_purchasable(&campaign(), 200, 0).is_err());
    }

    #[test]
    fn expired_or_cancelled_active_voucher_is_refundable_once() {
        assert!(assert_refundable(&campaign(), &voucher(), 150).is_err());
        assert!(assert_refundable(&campaign(), &voucher(), 200).is_ok());
        let mut cancelled = campaign();
        cancelled.cancelled = true;
        assert!(assert_refundable(&cancelled, &voucher(), 150).is_ok());
        let mut redeemed = voucher();
        redeemed.status = VoucherStatus::Redeemed;
        assert!(assert_refundable(&cancelled, &redeemed, 150).is_err());
    }

    #[test]
    fn redemption_rejects_expiry_and_replay() {
        assert!(assert_redeemable(&voucher(), 150).is_ok());
        assert!(assert_redeemable(&voucher(), 200).is_err());
        let mut already_used = voucher();
        already_used.status = VoucherStatus::Redeemed;
        assert!(assert_redeemable(&already_used, 150).is_err());
    }
}
