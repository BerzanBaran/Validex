// Local-validator integration check. The deterministic keys below are test-only;
// never fund them on devnet or mainnet. This script only connects to localhost.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const rpc = new Connection("http://127.0.0.1:8899", "confirmed");
const program = new PublicKey("5ohDEoj3QVVXSG82Fwru8BMuLP45dLWCPrirquzenmbh");
const token = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const associated = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const admin = Keypair.fromSeed(Uint8Array.from(Array(32).fill(11)));
const merchant = Keypair.fromSeed(Uint8Array.from(Array(32).fill(22)));
const customer = Keypair.fromSeed(Uint8Array.from(Array(32).fill(33)));
const stranger = Keypair.fromSeed(Uint8Array.from(Array(32).fill(44)));
const broke = Keypair.fromSeed(Uint8Array.from(Array(32).fill(55)));
const [platform] = PublicKey.findProgramAddressSync([Buffer.from("platform")], program);

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, program)[0];
}

function ata(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), token.toBuffer(), mint.toBuffer()], associated,
  )[0];
}

function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function ix(name, keys, data = Buffer.alloc(0)) {
  return new TransactionInstruction({
    programId: program,
    keys: keys.map(([pubkey, isSigner = false, isWritable = false]) => ({ pubkey, isSigner, isWritable })),
    data: Buffer.concat([disc(name), data]),
  });
}

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

function i64(n) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n));
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

async function send(instructions, signers) {
  return sendAndConfirmTransaction(rpc, new Transaction().add(...instructions), signers, {
    commitment: "confirmed",
  });
}

async function reject(label, instructions, signers) {
  let failed = false;
  try {
    await send(instructions, signers);
  } catch {
    failed = true;
  }
  assert.ok(failed, `${label} unexpectedly succeeded`);
  console.log(`PASS rejected: ${label}`);
}

async function airdrop(keypair) {
  const sig = await rpc.requestAirdrop(keypair.publicKey, 5_000_000_000);
  await rpc.confirmTransaction(sig, "confirmed");
}

async function createMint() {
  const mint = Keypair.generate();
  const rent = await rpc.getMinimumBalanceForRentExemption(82);
  const initialize = new TransactionInstruction({
    programId: token,
    keys: [
      { pubkey: mint.publicKey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([0, 6]), admin.publicKey.toBuffer(), Buffer.alloc(4)]),
  });
  await send([
    SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: mint.publicKey, lamports: rent, space: 82, programId: token }),
    initialize,
  ], [admin, mint]);
  return mint.publicKey;
}

async function createAta(owner, mint) {
  const address = ata(owner, mint);
  await send([new TransactionInstruction({
    programId: associated,
    keys: [
      [admin.publicKey, true, true], [address, false, true], [owner, false, false],
      [mint, false, false], [SystemProgram.programId, false, false], [token, false, false],
    ].map(([pubkey, isSigner, isWritable]) => ({ pubkey, isSigner, isWritable })),
    data: Buffer.alloc(0),
  })], [admin]);
  return address;
}

async function mintTo(mint, destination, amount) {
  await send([new TransactionInstruction({
    programId: token,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: admin.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([7]), u64(amount)]),
  })], [admin]);
}

async function amount(address) {
  return BigInt((await rpc.getTokenAccountBalance(address)).value.amount);
}

function campaignAccounts(id, mint) {
  const merchantAccount = pda([Buffer.from("merchant"), merchant.publicKey.toBuffer()]);
  const campaign = pda([Buffer.from("campaign"), merchantAccount.toBuffer(), u64(id)]);
  return { merchantAccount, campaign, escrow: ata(campaign, mint) };
}

function createCampaignIx(id, mint, now, price, stock) {
  const { merchantAccount, campaign, escrow } = campaignAccounts(id, mint);
  const data = Buffer.concat([
    u64(id), createHash("sha256").update(`campaign-${id}`).digest(),
    u64(price), u32(stock), u16(1), i64(now - 10), i64(now + 3600),
  ]);
  return ix("create_campaign", [
    [merchant.publicKey, true, true], [platform], [merchantAccount], [campaign, false, true],
    [mint], [escrow, false, true], [token], [associated], [SystemProgram.programId],
  ], data);
}

function purchaseIx(id, mint, buyer, buyerToken, hash, escrowOverride) {
  const { campaign, escrow } = campaignAccounts(id, mint);
  const counter = pda([Buffer.from("buyer"), campaign.toBuffer(), buyer.publicKey.toBuffer()]);
  const voucher = pda([Buffer.from("voucher"), campaign.toBuffer(), hash]);
  return { voucher, instruction: ix("purchase_voucher", [
    [buyer.publicKey, true, true], [platform], [campaign, false, true],
    [counter, false, true], [voucher, false, true], [mint],
    [buyerToken, false, true], [escrowOverride ?? escrow, false, true],
    [token], [SystemProgram.programId],
  ], hash) };
}

function redeemIx(id, mint, voucher, escrow, buyerSigner = true) {
  const { merchantAccount, campaign } = campaignAccounts(id, mint);
  return ix("redeem_voucher", [
    [customer.publicKey, buyerSigner], [merchant.publicKey, true, true], [platform],
    [merchantAccount], [campaign], [voucher, false, true], [mint],
    [escrow, false, true], [ata(merchant.publicKey, mint), false, true],
    [admin.publicKey], [ata(admin.publicKey, mint), false, true],
    [token], [associated], [SystemProgram.programId],
  ]);
}

function refundIx(id, mint, voucher, buyer, buyerToken) {
  const { campaign, escrow } = campaignAccounts(id, mint);
  return ix("refund_voucher", [
    [buyer.publicKey, true, true], [platform], [campaign], [voucher, false, true],
    [mint], [escrow, false, true], [buyerToken, false, true],
    [token], [associated], [SystemProgram.programId],
  ]);
}

async function main() {
  const version = await rpc.getVersion();
  assert.ok(version["solana-core"], "Local validator is not responding");
  const programAccount = await rpc.getAccountInfo(program);
  assert.ok(programAccount?.executable, "Local Validex program is not loaded");
  for (const wallet of [admin, merchant, customer, stranger, broke]) await airdrop(wallet);
  const mint = await createMint();
  const wrongMint = await createMint();
  const customerToken = await createAta(customer.publicKey, mint);
  const brokeToken = await createAta(broke.publicKey, mint);
  await mintTo(mint, customerToken, 20_000_000);

  const initialize = (signer) => ix("initialize_platform", [
    [signer.publicKey, true, true], [admin.publicKey], [platform, false, true],
    [mint], [token], [SystemProgram.programId],
  ]);
  await reject("wrong platform admin", [initialize(stranger)], [stranger]);
  assert.equal(await rpc.getAccountInfo(platform), null);
  await send([initialize(admin)], [admin]);
  const platformData = (await rpc.getAccountInfo(platform)).data;
  assert.equal(new PublicKey(platformData.subarray(8, 40)).toBase58(), admin.publicKey.toBase58());
  assert.equal(new PublicKey(platformData.subarray(72, 104)).toBase58(), mint.toBase58());
  assert.equal(platformData.readUInt16LE(136), 200);
  console.log("PASS platform initialized with pinned admin, mint and 2% fee");

  const { merchantAccount } = campaignAccounts(1, mint);
  const register = (signer) => ix("register_merchant", [
    [signer.publicKey, true, true], [platform], [merchant.publicKey],
    [merchantAccount, false, true], [SystemProgram.programId],
  ]);
  await reject("non-admin merchant registration", [register(stranger)], [stranger]);
  await send([register(admin)], [admin]);
  console.log("PASS admin registered merchant");

  const now = Math.floor(Date.now() / 1000);
  await send([createCampaignIx(1, mint, now, 5_000_000, 2)], [merchant]);
  const { campaign, escrow } = campaignAccounts(1, mint);
  const hash = createHash("sha256").update("voucher-one").digest();
  const first = purchaseIx(1, mint, customer, customerToken, hash);
  await reject("wrong escrow account", [purchaseIx(1, mint, customer, customerToken, hash, customerToken).instruction], [customer]);
  await reject("wrong payment mint", [purchaseIx(1, wrongMint, customer, customerToken, hash).instruction], [customer]);
  assert.equal(await amount(customerToken), 20_000_000n);
  await send([first.instruction], [customer]);
  assert.equal(await amount(customerToken), 15_000_000n);
  assert.equal(await amount(escrow), 5_000_000n);
  const campaignData = (await rpc.getAccountInfo(campaign)).data;
  assert.equal(campaignData.readUInt32LE(156), 1);
  await reject("duplicate voucher", [first.instruction], [customer]);
  const secondHash = createHash("sha256").update("voucher-two").digest();
  await reject("per-customer purchase limit", [purchaseIx(1, mint, customer, customerToken, secondHash).instruction], [customer]);
  await reject("insufficient customer USDC", [purchaseIx(1, mint, broke, brokeToken, secondHash).instruction], [broke]);
  assert.equal(await amount(escrow), 5_000_000n);
  assert.equal((await rpc.getAccountInfo(campaign)).data.readUInt32LE(156), 1);
  console.log("PASS purchase and rejected payments leave escrow and inventory correct");

  await reject("redemption without customer signature", [redeemIx(1, mint, first.voucher, escrow, false)], [merchant]);
  await send([redeemIx(1, mint, first.voucher, escrow)], [merchant, customer]);
  assert.equal(await amount(escrow), 0n);
  assert.equal(await amount(ata(merchant.publicKey, mint)), 4_900_000n);
  assert.equal(await amount(ata(admin.publicKey, mint)), 100_000n);
  await reject("second redemption", [redeemIx(1, mint, first.voucher, escrow)], [merchant, customer]);
  console.log("PASS two signatures, one-time redemption and 2% commission");

  await send([createCampaignIx(2, mint, now, 3_000_000, 1)], [merchant]);
  const otherHash = createHash("sha256").update("refund-voucher").digest();
  const other = purchaseIx(2, mint, customer, customerToken, otherHash);
  await send([other.instruction], [customer]);
  const otherAccounts = campaignAccounts(2, mint);
  await send([ix("cancel_campaign", [
    [merchant.publicKey, true], [merchantAccount], [otherAccounts.campaign, false, true],
  ])], [merchant]);
  await send([refundIx(2, mint, other.voucher, customer, customerToken)], [customer]);
  assert.equal(await amount(otherAccounts.escrow), 0n);
  assert.equal(await amount(customerToken), 15_000_000n);
  await reject("second refund", [refundIx(2, mint, other.voucher, customer, customerToken)], [customer]);
  console.log("PASS cancellation, customer refund and replay rejection");
  console.log("LOCALNET E2E PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
