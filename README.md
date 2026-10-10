# Validex

Validex is a non-custodial marketplace prototype where independent local businesses publish single-use vouchers priced in USDC on Solana.

The [hackathon submission pack](docs/hackathon-submission.md) contains the delivery checklist, architecture diagram, demo seed data, and video outlines. The Anchor program is deployed on Devnet; platform initialization and a Solflare payment proof are **not complete** yet.

## What it does

- Merchants create limited offers with stock, dates, and a per-wallet purchase limit.
- Customers connect Solflare or Phantom, pay USDC into campaign escrow, and receive a single-use QR voucher.
- A voucher activates only after the API verifies the on-chain transaction at `finalized` commitment.
- Redemption requires both customer and merchant wallet signatures. The program atomically pays 98% to the merchant and 2% to the platform.
- After cancellation or expiry, the owner of an unused voucher can request a full refund from escrow.

No private key or seed phrase is ever collected by Validex. Voucher secrets are encrypted in PostgreSQL; only their SHA-256 hashes are stored on-chain.

## Repository

```text
apps/web/          Next.js marketplace and dashboards
services/api/      FastAPI, PostgreSQL index, authentication, and verification
programs/          Anchor escrow program
docs/              Architecture, roadmap, and hackathon materials
```

## Run locally

Requirements: Docker Desktop and Node.js 20.9+.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Local endpoints:

- Web: http://localhost:3000
- Customer dashboard: http://localhost:3000/musteri
- Merchant dashboard: http://localhost:3000/isletme
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- PostgreSQL: localhost:5432

The app's UI is in English. Visitors can choose light or dark mode; their preference is saved in the browser. URL paths such as `/musteri` and `/isletme` remain unchanged for compatibility.

To run the API tests with Python 3.13 (Python 3.14 also works locally):

```powershell
cd services/api
python -m pip install -e ".[dev]"
python -m pytest
```

To verify the web app:

```powershell
cd apps/web
npm run verify
```

## Wallet sign-in and payment safety

Wallet login uses a short-lived, single-use challenge signed by Solflare or Phantom. Signing the login message is not a transfer. The access token is stored per browser tab in `sessionStorage` and expires after 15 minutes. Merchant endpoints require the verified merchant role and matching owner wallet.

Campaigns and vouchers are loaded from the API/PostgreSQL, not `localStorage`. A merchant creates an offer on-chain with their wallet, then the API verifies its transaction and records it. A customer starts with `POST /api/v1/vouchers/purchase-intent`, signs the `purchase_voucher` transaction, and pays into the campaign escrow ATA. The API checks the expected program, accounts, mint, amount, voucher hash, and `finalized` signature before activating the voucher. Transaction signatures are unique, so one signature cannot be reused for another voucher or campaign.

The UI never assumes a payment succeeded just because a wallet submitted it. If the tab closes, pending vouchers are checked against the voucher PDA and transaction history; payment is not automatically resubmitted. When confirmation is uncertain, inspect the chain before trying again.

For redemption, the merchant scans the customer's QR code and signs a transaction. The customer must add a second wallet signature. Staff wallets may verify a QR code but cannot approve escrow payouts. A customer can request a refund after offer cancellation or voucher expiry; refunds are not automatic.

Real payment buttons remain disabled until the deployed program's platform account is initialized and a merchant publishes an on-chain offer. Do not enter a private key or seed phrase into `.env`.

## Devnet configuration

The Devnet program ID is `5ohDEoj3QVVXSG82Fwru8BMuLP45dLWCPrirquzenmbh`; Circle Devnet USDC mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Set the same program ID, RPC endpoint, and mint in the web and API environments:

```env
VALIDEX_ADMIN_WALLET=ADMIN_SOLANA_PUBLIC_KEY
NEXT_PUBLIC_VALIDEX_ADMIN_WALLET=ADMIN_SOLANA_PUBLIC_KEY
VALIDEX_SOLANA_PROGRAM_ID=DEPLOYED_PROGRAM_ID
VALIDEX_USDC_MINT=DEVNET_USDC_MINT
NEXT_PUBLIC_VALIDEX_PROGRAM_ID=DEPLOYED_PROGRAM_ID
NEXT_PUBLIC_USDC_MINT=DEVNET_USDC_MINT
```

`VALIDEX_ADMIN_WALLET` must also be present in the **Anchor build environment**, because the program pins the admin at compile time. An `.env` file alone does not supply it to `anchor build`. Keep all wallet keypairs outside the repository.

## Security and operations

The API records suspicious QR attempts and audit events, and limits sign-in and scan requests. The current rate limiter is process-local; use a shared store before running multiple API replicas. The [architecture document](docs/architecture.md), [program guide](programs/README.md), and [API guide](services/api/README.md) provide more details.
