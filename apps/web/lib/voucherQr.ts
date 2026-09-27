import type { Voucher } from "./marketplace";

export type VoucherPass = {
  v: 1;
  type: "validex-voucher";
  voucherId: string;
  campaignId: string;
  code: string;
  ownerWallet: string;
};

const MAX_QR_BYTES = 1024;

export function encodeVoucherPass(voucher: Voucher): string {
  return JSON.stringify({
    v: 1,
    type: "validex-voucher",
    voucherId: voucher.id,
    campaignId: voucher.campaignId,
    code: voucher.code,
    ownerWallet: voucher.ownerWallet,
  } satisfies VoucherPass);
}

export function decodeVoucherPass(raw: string): VoucherPass {
  if (new TextEncoder().encode(raw).byteLength > MAX_QR_BYTES) {
    throw new Error("QR verisi izin verilen boyutu aşıyor.");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Bu QR kodu geçerli bir Validex kuponu değil.");
  }
  if (
    !payload || typeof payload !== "object" ||
    !("v" in payload) || payload.v !== 1 ||
    !("type" in payload) || payload.type !== "validex-voucher" ||
    !("voucherId" in payload) || typeof payload.voucherId !== "string" ||
    !("campaignId" in payload) || typeof payload.campaignId !== "string" ||
    !("code" in payload) || typeof payload.code !== "string" ||
    !("ownerWallet" in payload) || typeof payload.ownerWallet !== "string"
  ) {
    throw new Error("Bu QR kodu geçerli bir Validex kuponu değil.");
  }
  return payload as VoucherPass;
}
