import { describe, expect, it } from "vitest";

import type { Voucher } from "./marketplace";
import { decodeVoucherPass, encodeVoucherPass } from "./voucherQr";

const voucher: Voucher = {
  id: "voucher-1",
  campaignId: "campaign-1",
  ownerWallet: "7YVValidSolanaWalletAddressForTestOnly111111111",
  merchant: "Validex Cafe",
  title: "Two coffees, one price",
  priceUsdc: 5,
  purchasedAt: "2026-09-27T10:00:00.000Z",
  expiresAt: "2027-01-31",
  code: "VLDX-ABCDEF123456",
  secretBase64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  status: "active",
  campaignCancelled: false,
};

describe("Validex voucher QR payload", () => {
  it("round-trips the signed-in owner's voucher fields", () => {
    expect(decodeVoucherPass(encodeVoucherPass(voucher))).toEqual({
      v: 1,
      type: "validex-voucher",
      voucherId: voucher.id,
      campaignId: voucher.campaignId,
      code: voucher.code,
      secret: voucher.secretBase64,
      ownerWallet: voucher.ownerWallet,
    });
  });

  it("rejects unrelated QR content", () => {
    expect(() => decodeVoucherPass('{"type":"other"}')).toThrow("not a valid Validex voucher");
  });

  it("rejects a pass without a 32-byte voucher secret", () => {
    const encoded = encodeVoucherPass(voucher);
    const payload = JSON.parse(encoded);
    payload.secret = "public-reference-only";
    expect(() => decodeVoucherPass(JSON.stringify(payload))).toThrow("not a valid Validex voucher");
  });

  it("rejects oversized payloads before parsing", () => {
    expect(() => decodeVoucherPass("x".repeat(1025))).toThrow("exceeds the allowed size");
  });
});
