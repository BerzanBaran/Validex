use anchor_lang::prelude::*;

use crate::error::ValidexError;
use crate::state::BPS_DENOMINATOR;

#[derive(Debug, PartialEq, Eq)]
pub struct PaymentSplit {
    pub commission: u64,
    pub merchant: u64,
}

pub fn split_payment(gross: u64, commission_bps: u16) -> Result<PaymentSplit> {
    require!(
        u64::from(commission_bps) <= BPS_DENOMINATOR,
        ValidexError::InvalidCommission
    );
    let bps = u64::from(commission_bps);
    let commission = (gross / BPS_DENOMINATOR)
        .checked_mul(bps)
        .and_then(|whole| whole.checked_add((gross % BPS_DENOMINATOR) * bps / BPS_DENOMINATOR))
        .ok_or(ValidexError::ArithmeticOverflow)?;
    let merchant = gross
        .checked_sub(commission)
        .ok_or(ValidexError::ArithmeticOverflow)?;
    Ok(PaymentSplit {
        commission,
        merchant,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn five_usdc_splits_into_two_percent_and_merchant_balance() {
        assert_eq!(
            split_payment(5_000_000, 200).unwrap(),
            PaymentSplit {
                commission: 100_000,
                merchant: 4_900_000
            }
        );
    }

    #[test]
    fn split_handles_maximum_u64_without_overflow() {
        let split = split_payment(u64::MAX, 200).unwrap();
        assert_eq!(
            split.commission,
            (u64::MAX / 10_000) * 200 + (u64::MAX % 10_000) * 200 / 10_000
        );
        assert_eq!(split.merchant + split.commission, u64::MAX);
    }

    #[test]
    fn split_rejects_invalid_commission() {
        assert!(split_payment(1_000_000, 10_001).is_err());
    }
}
