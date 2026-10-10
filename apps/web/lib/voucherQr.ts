import type { Voucher } from "./marketplace";

export type VoucherPass = {
  v: 1;
  type: "validex-voucher";
  voucherId: string;
  campaignId: string;
  code: string;
  secret: string;
  ownerWallet: string;
  chainVoucher?: string;
};

const MAX_QR_BYTES = 1024;

export function encodeVoucherPass(voucher: Voucher): string {
  return JSON.stringify({
    v: 1,
    type: "validex-voucher",
    voucherId: voucher.id,
    campaignId: voucher.campaignId,
    code: voucher.code,
    secret: voucher.secretBase64,
    ownerWallet: voucher.ownerWallet,
    chainVoucher: voucher.chainVoucher,
  } satisfies VoucherPass);
}

export function decodeVoucherPass(raw: string): VoucherPass {
  if (new TextEncoder().encode(raw).byteLength > MAX_QR_BYTES) {
    throw new Error("QR data exceeds the allowed size.");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("This QR code is not a valid Validex voucher.");
  }
  if (
    !payload || typeof payload !== "object" ||
    !("v" in payload) || payload.v !== 1 ||
    !("type" in payload) || payload.type !== "validex-voucher" ||
    !("voucherId" in payload) || typeof payload.voucherId !== "string" ||
    !("campaignId" in payload) || typeof payload.campaignId !== "string" ||
    !("code" in payload) || typeof payload.code !== "string" ||
    !("secret" in payload) || typeof payload.secret !== "string" ||
    !/^[A-Za-z0-9+/]{43}=$/.test(payload.secret) ||
    !("ownerWallet" in payload) || typeof payload.ownerWallet !== "string" ||
    ("chainVoucher" in payload && payload.chainVoucher !== undefined && typeof payload.chainVoucher !== "string")
  ) {
    throw new Error("This QR code is not a valid Validex voucher.");
  }
  return payload as VoucherPass;
}
