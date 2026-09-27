import { describe, expect, it } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";

import { bytesFromHex, purchaseInstruction, usdcMinor, voucherPda, type ChainConfig } from "./validexChain";

describe("USDC transaction input", () => {
  it("converts displayed USDC to six-decimal integer units", () => {
    expect(usdcMinor(5)).toBe(5_000_000n);
    expect(usdcMinor(0.000001)).toBe(1n);
    expect(usdcMinor(1.25)).toBe(1_250_000n);
  });

  it("rejects invalid amounts and voucher hashes", () => {
    expect(() => usdcMinor(0)).toThrow();
    expect(() => usdcMinor(0.0000004)).toThrow();
    expect(() => usdcMinor(Number.NaN)).toThrow();
    expect(() => bytesFromHex("abcd")).toThrow();
    expect(bytesFromHex("ab".repeat(32))).toEqual(new Uint8Array(32).fill(0xab));
  });
});

describe("purchase instruction", () => {
  it("binds the buyer, campaign, escrow and unique voucher hash", async () => {
    const address = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte));
    const programId = address(1);
    const platform = address(2);
    const buyer = address(3);
    const campaign = address(4);
    const mint = address(5);
    const data = new Uint8Array(180);
    data.set(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("account:Campaign"))).slice(0, 8));
    data.set(platform.toBytes(), 72);
    const view = new DataView(data.buffer);
    view.setBigUint64(144, 5_000_000n, true);
    view.setUint32(152, 10, true);
    view.setBigInt64(162, BigInt(Math.floor(Date.now() / 1000) - 100), true);
    view.setBigInt64(170, BigInt(Math.floor(Date.now() / 1000) + 100), true);
    const connection = {
      getAccountInfo: async () => ({ owner: programId, data }),
      getTokenAccountBalance: async () => ({ value: { amount: "5000000" } }),
    } as unknown as Connection;
    const config: ChainConfig = {
      connection, programId, platform, mint, tokenProgram: address(6), treasury: address(7),
    };
    const hash = new Uint8Array(32).fill(9);
    const result = await purchaseInstruction(config, buyer.toBase58(), campaign.toBase58(), hash);
    expect(result.priceMinor).toBe(5_000_000n);
    expect(result.voucher.equals(voucherPda(config, campaign, hash))).toBe(true);
    expect(result.instruction.keys[0].pubkey.equals(buyer)).toBe(true);
    expect(result.instruction.keys[2].pubkey.equals(campaign)).toBe(true);
    expect(result.instruction.keys[4].pubkey.equals(result.voucher)).toBe(true);
    expect(result.instruction.keys).toHaveLength(10);
  });
});
