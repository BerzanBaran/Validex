use anchor_lang::prelude::*;

use crate::error::ValidexError;
use crate::state::BPS_DENOMINATOR;

pub fn split_payment(gross: u64, commission_bps: u16) -> Result<(u64, u64)> {
    let commission = gross
        .checked_mul(u64::from(commission_bps))
        .ok_or(ValidexError::ArithmeticOverflow)?
        / BPS_DENOMINATOR;
    let merchant = gross
        .checked_sub(commission)
        .ok_or(ValidexError::ArithmeticOverflow)?;
    Ok((commission, merchant))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn five_usdc_splits_into_two_percent_and_merchant_balance() {
        assert_eq!(split_payment(5_000_000, 200).unwrap(), (100_000, 4_900_000));
    }

    #[test]
    fn split_rejects_overflow() {
        assert!(split_payment(u64::MAX, 200).is_err());
    }
}
