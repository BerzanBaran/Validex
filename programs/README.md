# Validex Anchor program

`programs/validex` is a single-mint Solana USDC voucher escrow program built with Anchor `1.2.0`. Its Devnet program ID is `5ohDEoj3QVVXSG82Fwru8BMuLP45dLWCPrirquzenmbh`; the upgrade authority is the admin wallet `Cwd8Y3CtzztBcY5dwhLgqBMywtJuKW86KdqqLGwH2Zc8`. The program keypair is kept outside the repository.

`VALIDEX_ADMIN_WALLET` pins the admin public key at build time. If it is missing or invalid, `initialize_platform` fails safely. Supply it to the Anchor build environment; an `.env` file alone is not enough. Never put a private key or seed phrase in the repository.

## Accounts

| Account | PDA seeds | Purpose |
| --- | --- | --- |
| Platform | `platform` | Admin, treasury, payment mint, token program, and fixed 2% fee |
| Merchant | `merchant`, merchant wallet | Admin-registered merchant |
| Campaign | `campaign`, Merchant PDA, little-endian `campaign_id` u64 | Price, inventory, dates, limit, and cancellation |
| BuyerCounter | `buyer`, Campaign PDA, customer wallet | Per-wallet purchase limit |
| Voucher | `voucher`, Campaign PDA, 32-byte voucher hash | Owner, amount, and one-time status |

The escrow account is the Campaign PDA's associated token account for the payment mint. Purchase deposits the full amount. Redemption requires both customer and merchant signatures and atomically pays 2% to the treasury and 98% to the merchant. A failed token transfer rolls back the whole Solana transaction.

After cancellation or expiry, the owner of an unused active voucher may request a full refund. Refunds are **not** automatically transferred; the owner signs `refund_voucher`. A successful refund changes the voucher status to `Refunded`, preventing another refund or redemption. Cancellation stops new sales and redemption and makes outstanding unused vouchers immediately refundable.

The API creates a high-entropy voucher secret, stores it encrypted, and places only its 32-byte SHA-256 hash on-chain. Redemption does not reveal the secret on-chain; both parties sign the same transaction.

## Local checks

```bash
cargo fmt --all -- --check
cargo test -p validex --lib
anchor build --arch v2
# With a fresh local validator and the test-admin build deployed:
node apps/web/tests/validex-localnet.mjs
```

Nine Rust unit tests and the local-validator end-to-end test have passed. The validator test checks mint and escrow constraints, signatures, purchase limits, one-time redemption, fee splitting, cancellation, and refund replay. The Devnet program has been deployed; platform initialization and a real Solflare payment demonstration remain pending. See the [hackathon verification checklist](../docs/hackathon-submission.md).

The current Devnet cluster rejects sBPFv3 builds, so use `anchor build --arch v2` for upgrades until its feature gate is activated. The build must include `VALIDEX_ADMIN_WALLET` in the Anchor process environment. Since the upgrade authority is the user's Solflare wallet, a future upgrade requires that wallet's explicit signature; the technical deployer key no longer has upgrade rights.
