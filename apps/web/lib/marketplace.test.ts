import { describe, expect, it } from "vitest";

import { voucherFromApi } from "./marketplace";
import type { ApiVoucher } from "./voucherApi";

const remote: ApiVoucher = {
  id: "voucher-1",
  campaign_id: "campaign-1",
  status: "pending_chain",
  expires_at: "2027-02-01T00:00:00Z",
  purchased_at: null,
  onchain_address: null,
  secret_base64: "",
  voucher_hash_hex: "a".repeat(64),
  campaign_title: "İki kahve",
  merchant_name: "Kafe",
  price_minor: 5_000_000,
};

describe("API-backed voucher mapping", () => {
  it("keeps a PostgreSQL purchase intent pending without a chain address", () => {
    const voucher = voucherFromApi(remote, "buyer-wallet");
    expect(voucher.status).toBe("pending");
    expect(voucher.chainVoucher).toBeUndefined();
    expect(voucher.title).toBe("İki kahve");
    expect(voucher.merchant).toBe("Kafe");
    expect(voucher.priceUsdc).toBe(5);
    expect(voucher.purchasedAt).toBe("");
  });

  it("only maps an API-confirmed voucher to active", () => {
    const voucher = voucherFromApi({
      ...remote,
      status: "active",
      onchain_address: "chain-voucher",
      purchased_at: "2026-09-27T00:00:00Z",
    }, "buyer-wallet");
    expect(voucher.status).toBe("active");
    expect(voucher.chainVoucher).toBe("chain-voucher");
  });
});
