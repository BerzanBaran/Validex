"use client";

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

import { signSolanaTransaction } from "./solanaWallet";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.NEXT_PUBLIC_VALIDEX_PROGRAM_ID ?? "";
const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT ?? "";
const ENCODER = new TextEncoder();
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export type ChainConfig = {
  connection: Connection;
  programId: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  platform: PublicKey;
  treasury: PublicKey;
};

function key(value: string, label: string): PublicKey {
  try { return new PublicKey(value); }
  catch { throw new Error(`${label} is not a valid Solana address.`); }
}

function pda(programId: PublicKey, ...seeds: Uint8Array[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function u64(value: bigint): Uint8Array {
  if (value < 0n || value > 18_446_744_073_709_551_615n) throw new Error("Invalid u64 value.");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function i64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function join(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function digest(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value as BufferSource));
}

async function discriminator(namespace: "account" | "global", name: string): Promise<Uint8Array> {
  return (await digest(ENCODER.encode(`${namespace}:${name}`))).slice(0, 8);
}

function matches(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function meta(pubkey: PublicKey, isSigner = false, isWritable = false) {
  return { pubkey, isSigner, isWritable };
}

function tokenAddress(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), tokenProgram.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function chainConfigured(): boolean {
  return Boolean(PROGRAM_ID && USDC_MINT && process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet");
}

export async function loadChain(): Promise<ChainConfig> {
  if (!chainConfigured()) throw new Error("On-chain payments are disabled until the program and devnet USDC mint are configured.");
  const programId = key(PROGRAM_ID, "Program ID");
  const mint = key(USDC_MINT, "USDC mint");
  const connection = new Connection(RPC_URL, "confirmed");
  const program = await connection.getAccountInfo(programId, "confirmed");
  if (!program?.executable) throw new Error("The Validex program is not deployed on this devnet RPC.");
  const platform = pda(programId, ENCODER.encode("platform"));
  const platformAccount = await connection.getAccountInfo(platform, "confirmed");
  const accountDiscriminator = await discriminator("account", "Platform");
  if (!platformAccount || !platformAccount.owner.equals(programId) ||
      !matches(platformAccount.data.subarray(0, 8), accountDiscriminator) || platformAccount.data.length < 139) {
    throw new Error("The Validex platform account is missing or invalid.");
  }
  const treasury = new PublicKey(platformAccount.data.subarray(40, 72));
  const platformMint = new PublicKey(platformAccount.data.subarray(72, 104));
  const tokenProgram = new PublicKey(platformAccount.data.subarray(104, 136));
  if (!platformMint.equals(mint)) throw new Error("The USDC mint does not match the platform.");
  if (!tokenProgram.equals(TOKEN_PROGRAM_ID) && !tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("The platform token program is not supported.");
  }
  const mintAccount = await connection.getAccountInfo(mint, "confirmed");
  if (!mintAccount?.owner.equals(tokenProgram)) throw new Error("The payment mint does not match the token program.");
  const supply = await connection.getTokenSupply(mint, "confirmed");
  if (supply.value.decimals !== 6) throw new Error("The payment mint must have six decimal places.");
  return { connection, programId, mint, tokenProgram, platform, treasury };
}

export async function initializePlatformInstruction(adminAddress: string): Promise<{
  config: ChainConfig;
  instruction: TransactionInstruction;
}> {
  if (!chainConfigured()) throw new Error("Configure the Devnet program and USDC mint first.");
  const admin = key(adminAddress, "Admin wallet");
  const programId = key(PROGRAM_ID, "Program ID");
  const mint = key(USDC_MINT, "USDC mint");
  const connection = new Connection(RPC_URL, "confirmed");
  const programAccount = await connection.getAccountInfo(programId, "confirmed");
  if (!programAccount?.executable) throw new Error("The Validex program is not deployed on Devnet yet.");
  const platform = pda(programId, ENCODER.encode("platform"));
  if (await connection.getAccountInfo(platform, "confirmed")) {
    throw new Error("The platform is already initialized. Refresh the page before trying again.");
  }
  const mintAccount = await connection.getAccountInfo(mint, "confirmed");
  if (!mintAccount) throw new Error("The configured Devnet USDC mint was not found.");
  const tokenProgram = mintAccount.owner;
  if (!tokenProgram.equals(TOKEN_PROGRAM_ID) && !tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("The USDC mint does not belong to a supported token program.");
  }
  const supply = await connection.getTokenSupply(mint, "confirmed");
  if (supply.value.decimals !== 6) throw new Error("The payment mint must have six decimal places.");
  const config = { connection, programId, mint, tokenProgram, platform, treasury: admin };
  return {
    config,
    instruction: new TransactionInstruction({
      programId,
      keys: [
        meta(admin, true, true), meta(admin), meta(platform, false, true),
        meta(mint), meta(tokenProgram), meta(SystemProgram.programId),
      ],
      data: Buffer.from(await discriminator("global", "initialize_platform")),
    }),
  };
}

export function merchantPda(config: ChainConfig, wallet: string): PublicKey {
  return pda(config.programId, ENCODER.encode("merchant"), key(wallet, "Merchant wallet").toBytes());
}

export function campaignPda(config: ChainConfig, merchant: PublicKey, campaignId: bigint): PublicKey {
  return pda(config.programId, ENCODER.encode("campaign"), merchant.toBytes(), u64(campaignId));
}

export function voucherPda(config: ChainConfig, campaign: PublicKey, voucherHash: Uint8Array): PublicKey {
  if (voucherHash.length !== 32) throw new Error("The voucher hash must be 32 bytes.");
  return pda(config.programId, ENCODER.encode("voucher"), campaign.toBytes(), voucherHash);
}

export async function accountExists(config: ChainConfig, address: PublicKey): Promise<boolean> {
  const account = await config.connection.getAccountInfo(address, "finalized");
  return Boolean(account && account.owner.equals(config.programId));
}

export async function readVoucherStatus(config: ChainConfig, address: PublicKey): Promise<"missing" | "active" | "redeemed" | "refunded"> {
  const account = await config.connection.getAccountInfo(address, "finalized");
  if (!account) return "missing";
  if (!account.owner.equals(config.programId) || account.data.length < 130 ||
      !matches(account.data.subarray(0, 8), await discriminator("account", "Voucher"))) {
    throw new Error("Invalid on-chain voucher account.");
  }
  const state = account.data[128];
  if (state === 0) return "active";
  if (state === 1) return "redeemed";
  if (state === 2) return "refunded";
  throw new Error("Unknown on-chain voucher status.");
}

export async function sendWalletTransaction(
  config: ChainConfig,
  walletAddress: string,
  instruction: TransactionInstruction,
  expectedAccount: PublicKey,
  onSubmitted?: (signature: string) => void,
): Promise<string> {
  const wallet = key(walletAddress, "Wallet");
  const { blockhash, lastValidBlockHeight } = await config.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({ feePayer: wallet, recentBlockhash: blockhash }).add(instruction);
  const message = transaction.serializeMessage();
  const signed = await signSolanaTransaction(transaction, walletAddress);
  if (!signed.feePayer?.equals(wallet) || !matches(message, signed.serializeMessage()) || !signed.verifySignatures()) {
    throw new Error("Could not verify the wallet signature or transaction contents.");
  }
  const signature = await config.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  onSubmitted?.(signature);
  let result;
  try {
    result = await config.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "finalized");
  } catch {
    throw new Error(`Transaction submitted (${signature}), but confirmation was not received. Check the chain before submitting again.`);
  }
  if (result.value.err) throw new Error(`On-chain transaction failed: ${JSON.stringify(result.value.err)}`);
  if (!await accountExists(config, expectedAccount)) {
    throw new Error(`Transaction submitted (${signature}), but the on-chain account is not verified yet. Check the explorer before paying again.`);
  }
  return signature;
}

export async function purchaseInstruction(config: ChainConfig, buyerAddress: string, campaignAddress: string, voucherHash: Uint8Array) {
  const buyer = key(buyerAddress, "Customer wallet");
  const campaign = key(campaignAddress, "Offer PDA");
  const account = await config.connection.getAccountInfo(campaign, "confirmed");
  if (!account || !account.owner.equals(config.programId) || account.data.length < 180 ||
      !matches(account.data.subarray(0, 8), await discriminator("account", "Campaign")) ||
      !new PublicKey(account.data.subarray(72, 104)).equals(config.platform)) {
    throw new Error("Offer not found on-chain or does not belong to this platform.");
  }
  const data = new DataView(account.data.buffer, account.data.byteOffset);
  const priceMinor = data.getBigUint64(144, true);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (account.data[178] !== 0 || data.getUint32(156, true) >= data.getUint32(152, true) ||
      now < data.getBigInt64(162, true) || now >= data.getBigInt64(170, true)) {
    throw new Error("This offer is no longer available on-chain.");
  }
  const voucher = voucherPda(config, campaign, voucherHash);
  const buyerCounter = pda(config.programId, ENCODER.encode("buyer"), campaign.toBytes(), buyer.toBytes());
  const buyerToken = tokenAddress(config.mint, buyer, config.tokenProgram);
  let balance;
  try { balance = await config.connection.getTokenAccountBalance(buyerToken, "confirmed"); }
  catch { throw new Error("The customer wallet has no token account for this USDC mint."); }
  if (BigInt(balance.value.amount) < priceMinor) throw new Error("Insufficient USDC balance for this voucher.");
  const escrow = tokenAddress(config.mint, campaign, config.tokenProgram);
  const instruction = new TransactionInstruction({
    programId: config.programId,
    keys: [
      meta(buyer, true, true), meta(config.platform), meta(campaign, false, true),
      meta(buyerCounter, false, true), meta(voucher, false, true), meta(config.mint),
      meta(buyerToken, false, true), meta(escrow, false, true), meta(config.tokenProgram),
      meta(SystemProgram.programId),
    ],
    data: Buffer.from(join(await discriminator("global", "purchase_voucher"), voucherHash)),
  });
  return { instruction, voucher, priceMinor };
}

export async function registerMerchantInstruction(config: ChainConfig, adminAddress: string, merchantAddress: string) {
  const admin = key(adminAddress, "Admin wallet");
  const merchantWallet = key(merchantAddress, "Merchant wallet");
  const merchant = merchantPda(config, merchantAddress);
  return {
    merchant,
    instruction: new TransactionInstruction({
      programId: config.programId,
      keys: [meta(admin, true, true), meta(config.platform), meta(merchantWallet), meta(merchant, false, true), meta(SystemProgram.programId)],
      data: Buffer.from(await discriminator("global", "register_merchant")),
    }),
  };
}

export async function createCampaignInstruction(config: ChainConfig, input: {
  merchantWallet: string; campaignId: bigint; metadataHash: Uint8Array; priceMinor: bigint;
  stock: number; perUserLimit: number; startsAt: bigint; expiresAt: bigint;
}) {
  if (input.metadataHash.length !== 32 || !Number.isInteger(input.stock) || input.stock < 1 ||
      !Number.isInteger(input.perUserLimit) || input.perUserLimit < 1) throw new Error("Invalid offer data.");
  const authority = key(input.merchantWallet, "Merchant wallet");
  const merchant = merchantPda(config, input.merchantWallet);
  const campaign = campaignPda(config, merchant, input.campaignId);
  const escrow = tokenAddress(config.mint, campaign, config.tokenProgram);
  const data = join(
    await discriminator("global", "create_campaign"), u64(input.campaignId), input.metadataHash,
    u64(input.priceMinor), u32(input.stock), u16(input.perUserLimit), i64(input.startsAt), i64(input.expiresAt),
  );
  return {
    campaign,
    instruction: new TransactionInstruction({
      programId: config.programId,
      keys: [
        meta(authority, true, true), meta(config.platform), meta(merchant), meta(campaign, false, true),
        meta(config.mint), meta(escrow, false, true), meta(config.tokenProgram),
        meta(ASSOCIATED_TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
      ],
      data: Buffer.from(data),
    }),
  };
}

export async function cancelCampaignInstruction(config: ChainConfig, merchantAddress: string, campaignAddress: string) {
  const authority = key(merchantAddress, "Merchant wallet");
  const merchant = merchantPda(config, merchantAddress);
  const campaign = key(campaignAddress, "Offer PDA");
  return {
    campaign,
    instruction: new TransactionInstruction({
      programId: config.programId,
      keys: [meta(authority, true), meta(merchant), meta(campaign, false, true)],
      data: Buffer.from(await discriminator("global", "cancel_campaign")),
    }),
  };
}

export async function campaignCancelled(config: ChainConfig, campaign: PublicKey): Promise<boolean> {
  const account = await config.connection.getAccountInfo(campaign, "confirmed");
  if (!account || !account.owner.equals(config.programId) || account.data.length < 180 ||
      !matches(account.data.subarray(0, 8), await discriminator("account", "Campaign"))) {
    throw new Error("Could not verify the on-chain offer.");
  }
  return account.data[178] === 1;
}

export function usdcMinor(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) throw new Error("Invalid USDC amount.");
  const minor = value * 1_000_000;
  const rounded = Math.round(minor);
  if (!Number.isSafeInteger(rounded) || rounded < 1 || Math.abs(minor - rounded) > 0.000001) {
    throw new Error("USDC amounts may have at most six decimal places.");
  }
  return BigInt(rounded);
}

export function randomCampaignId(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return new DataView(bytes.buffer).getBigUint64(0, true);
}

export async function hashVoucherSecret(secret: Uint8Array): Promise<Uint8Array> {
  if (secret.length !== 32) throw new Error("The voucher secret must be 32 bytes.");
  return digest(secret);
}

export function bytesFromHex(value: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("Invalid voucher hash.");
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
}

export async function hashCampaignMetadata(value: unknown): Promise<Uint8Array> {
  return digest(ENCODER.encode(JSON.stringify(value)));
}

export async function redeemInstruction(config: ChainConfig, voucherAddress: string, buyerAddress: string, merchantAddress: string) {
  const buyer = key(buyerAddress, "Customer wallet");
  const merchantWallet = key(merchantAddress, "Merchant wallet");
  const voucher = key(voucherAddress, "Voucher PDA");
  const voucherAccount = await config.connection.getAccountInfo(voucher, "confirmed");
  if (!voucherAccount || !voucherAccount.owner.equals(config.programId) || voucherAccount.data.length < 130 ||
      !matches(voucherAccount.data.subarray(0, 8), await discriminator("account", "Voucher")) ||
      !new PublicKey(voucherAccount.data.subarray(40, 72)).equals(buyer) || voucherAccount.data[128] !== 0) {
    throw new Error("The voucher is not active on-chain or does not belong to this customer.");
  }
  const campaign = new PublicKey(voucherAccount.data.subarray(8, 40));
  const voucherHash = voucherAccount.data.subarray(72, 104);
  if (!voucherPda(config, campaign, voucherHash).equals(voucher)) throw new Error("Voucher PDA mismatch.");
  const campaignAccount = await config.connection.getAccountInfo(campaign, "confirmed");
  const merchant = merchantPda(config, merchantAddress);
  if (!campaignAccount || !campaignAccount.owner.equals(config.programId) || campaignAccount.data.length < 180 ||
      !matches(campaignAccount.data.subarray(0, 8), await discriminator("account", "Campaign")) ||
      !new PublicKey(campaignAccount.data.subarray(8, 40)).equals(merchant)) {
    throw new Error("This voucher does not belong to the merchant's offer.");
  }
  const escrow = tokenAddress(config.mint, campaign, config.tokenProgram);
  const merchantToken = tokenAddress(config.mint, merchantWallet, config.tokenProgram);
  const treasuryToken = tokenAddress(config.mint, config.treasury, config.tokenProgram);
  const instruction = new TransactionInstruction({
    programId: config.programId,
    keys: [
      meta(buyer, true), meta(merchantWallet, true, true), meta(config.platform), meta(merchant),
      meta(campaign), meta(voucher, false, true), meta(config.mint), meta(escrow, false, true),
      meta(merchantToken, false, true), meta(config.treasury), meta(treasuryToken, false, true),
      meta(config.tokenProgram), meta(ASSOCIATED_TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
    ],
    data: Buffer.from(await discriminator("global", "redeem_voucher")),
  });
  return { instruction, voucher, campaign };
}

export async function refundInstruction(config: ChainConfig, voucherAddress: string, buyerAddress: string) {
  const buyer = key(buyerAddress, "Customer wallet");
  const voucher = key(voucherAddress, "Voucher PDA");
  const voucherAccount = await config.connection.getAccountInfo(voucher, "confirmed");
  if (!voucherAccount || !voucherAccount.owner.equals(config.programId) || voucherAccount.data.length < 130 ||
      !matches(voucherAccount.data.subarray(0, 8), await discriminator("account", "Voucher")) ||
      !new PublicKey(voucherAccount.data.subarray(40, 72)).equals(buyer) || voucherAccount.data[128] !== 0) {
    throw new Error("A valid, active on-chain voucher owned by you is required for a refund.");
  }
  const campaign = new PublicKey(voucherAccount.data.subarray(8, 40));
  const campaignAccount = await config.connection.getAccountInfo(campaign, "confirmed");
  const expiresAt = new DataView(voucherAccount.data.buffer, voucherAccount.data.byteOffset).getBigInt64(120, true);
  if (!campaignAccount || !campaignAccount.owner.equals(config.programId) || campaignAccount.data.length < 180 ||
      !matches(campaignAccount.data.subarray(0, 8), await discriminator("account", "Campaign")) ||
      (campaignAccount.data[178] === 0 && BigInt(Math.floor(Date.now() / 1000)) < expiresAt)) {
    throw new Error("Refunds are available only after offer cancellation or voucher expiry.");
  }
  const escrow = tokenAddress(config.mint, campaign, config.tokenProgram);
  const buyerToken = tokenAddress(config.mint, buyer, config.tokenProgram);
  return {
    voucher,
    instruction: new TransactionInstruction({
      programId: config.programId,
      keys: [
        meta(buyer, true, true), meta(config.platform), meta(campaign), meta(voucher, false, true),
        meta(config.mint), meta(escrow, false, true), meta(buyerToken, false, true),
        meta(config.tokenProgram), meta(ASSOCIATED_TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
      ],
      data: Buffer.from(await discriminator("global", "refund_voucher")),
    }),
  };
}

export type RedemptionHandoff = {
  v: 1;
  kind: "validex-redemption";
  transaction: string;
  lastValidBlockHeight: number;
  voucher: string;
  buyer: string;
  merchant: string;
};

export async function prepareRedemptionHandoff(voucherAddress: string, buyerAddress: string, merchantAddress: string, expectedCampaignAddress: string): Promise<string> {
  const config = await loadChain();
  const { instruction, campaign } = await redeemInstruction(config, voucherAddress, buyerAddress, merchantAddress);
  if (!campaign.equals(key(expectedCampaignAddress, "Offer PDA"))) throw new Error("The voucher does not belong to the selected offer.");
  const { blockhash, lastValidBlockHeight } = await config.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({ feePayer: key(merchantAddress, "Merchant wallet"), recentBlockhash: blockhash }).add(instruction);
  const message = transaction.serializeMessage();
  const signed = await signSolanaTransaction(transaction, merchantAddress);
  if (!matches(message, signed.serializeMessage()) || !signed.verifySignatures(false) ||
      !signed.signatures.some((entry) => entry.publicKey.toBase58() === merchantAddress && entry.signature)) {
    throw new Error("Could not verify the merchant signature.");
  }
  const handoff: RedemptionHandoff = {
    v: 1, kind: "validex-redemption",
    transaction: signed.serialize({ requireAllSignatures: false }).toString("base64"),
    lastValidBlockHeight, voucher: voucherAddress, buyer: buyerAddress, merchant: merchantAddress,
  };
  return JSON.stringify(handoff);
}

export async function confirmRedemptionHandoff(raw: string, expectedVoucher: string, buyerAddress: string): Promise<string> {
  if (raw.length > 8000) throw new Error("Transaction data is too large.");
  let handoff: RedemptionHandoff;
  try { handoff = JSON.parse(raw) as RedemptionHandoff; }
  catch { throw new Error("Invalid transaction data."); }
  if (handoff.v !== 1 || handoff.kind !== "validex-redemption" ||
      handoff.voucher !== expectedVoucher || handoff.buyer !== buyerAddress ||
      typeof handoff.transaction !== "string" || !Number.isSafeInteger(handoff.lastValidBlockHeight)) {
    throw new Error("This transaction does not belong to this voucher or wallet.");
  }
  const config = await loadChain();
  const { instruction, voucher } = await redeemInstruction(config, expectedVoucher, buyerAddress, handoff.merchant);
  const transaction = Transaction.from(Buffer.from(handoff.transaction, "base64"));
  if (transaction.instructions.length !== 1 || !transaction.feePayer?.equals(key(handoff.merchant, "Merchant wallet"))) {
    throw new Error("The transaction contains unexpected extra instructions.");
  }
  const received = transaction.instructions[0];
  if (!received.programId.equals(instruction.programId) || !matches(received.data, instruction.data) ||
      received.keys.length !== instruction.keys.length || received.keys.some((item, index) =>
        !item.pubkey.equals(instruction.keys[index].pubkey) || item.isSigner !== instruction.keys[index].isSigner ||
        item.isWritable !== instruction.keys[index].isWritable)) {
    throw new Error("The voucher or payment destinations were changed in the transaction.");
  }
  if (!transaction.verifySignatures(false) ||
      !transaction.signatures.some((entry) => entry.publicKey.toBase58() === handoff.merchant && entry.signature)) {
    throw new Error("Invalid merchant signature.");
  }
  if ((await config.connection.getBlockHeight("confirmed")) > handoff.lastValidBlockHeight) {
    throw new Error("The signature expired. Request a new transaction from the merchant.");
  }
  const message = transaction.serializeMessage();
  const signed = await signSolanaTransaction(transaction, buyerAddress);
  if (!matches(message, signed.serializeMessage()) || !signed.verifySignatures()) {
    throw new Error("Could not verify the customer and merchant signatures.");
  }
  const signature = await config.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  let result;
  try {
    result = await config.connection.confirmTransaction({
      signature, blockhash: signed.recentBlockhash!, lastValidBlockHeight: handoff.lastValidBlockHeight,
    }, "confirmed");
  } catch {
    throw new Error(`Transaction submitted (${signature}), but confirmation is uncertain. Check the chain before signing again.`);
  }
  if (result.value.err) throw new Error(`Voucher redemption failed: ${JSON.stringify(result.value.err)}`);
  const voucherAccount = await config.connection.getAccountInfo(voucher, "confirmed");
  if (voucherAccount?.data[128] !== 1) {
    throw new Error(`Transaction submitted (${signature}), but voucher status is not verified yet. Check the chain before signing again.`);
  }
  return signature;
}
