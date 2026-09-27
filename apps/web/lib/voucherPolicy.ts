import type { Voucher } from "./marketplace";

export type VoucherAction = "redeem" | "refund" | "none";

// An expired voucher remains active on-chain until its owner claims a refund.
// This is display guidance only; the Solana program decides eligibility.
export function voucherAction(voucher: Voucher, now = Date.now()): VoucherAction {
  if (voucher.status !== "active" || !voucher.chainVoucher) return "none";
  const expiresAt = new Date(voucher.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return "none";
  if (voucher.campaignCancelled || expiresAt <= now) return "refund";
  return "redeem";
}
