import { describe, expect, it } from "vitest";

import type { Voucher } from "./marketplace";
import { voucherAction } from "./voucherPolicy";

const active: Voucher = {
  id: "voucher", campaignId: "campaign", ownerWallet: "buyer", merchant: "Cafe",
  title: "Coffee", priceUsdc: 5, purchasedAt: "", expiresAt: "2027-01-01T00:00:00Z",
  code: "VLDX", status: "active", chainVoucher: "voucher-pda", campaignCancelled: false,
};

describe("voucher refund policy", () => {
  it("allows redemption only before expiry while the campaign is active", () => {
    expect(voucherAction(active, Date.parse("2026-12-31T23:59:59Z"))).toBe("redeem");
  });

  it("lets the owner request a refund after expiry or cancellation", () => {
    expect(voucherAction(active, Date.parse("2027-01-01T00:00:00Z"))).toBe("refund");
    expect(voucherAction({ ...active, campaignCancelled: true }, Date.parse("2026-12-01T00:00:00Z"))).toBe("refund");
  });

  it("never offers another payout after redemption or refund", () => {
    expect(voucherAction({ ...active, status: "redeemed" })).toBe("none");
    expect(voucherAction({ ...active, status: "refunded" })).toBe("none");
    expect(voucherAction({ ...active, chainVoucher: undefined })).toBe("none");
    expect(voucherAction({ ...active, expiresAt: "invalid" })).toBe("none");
  });
});
