# Validex API

This FastAPI service indexes off-chain data and coordinates workflows. It has no payment authority and stores no user private keys.

`GET /api/v1/transactions/{signature}/status` returns `pending`, `confirmed`, `finalized`, or `failed`. Voucher and offer confirmation endpoints record only finalized transactions after verifying the Validex instruction, signers, accounts, and applicable USDC transfers. A transaction signature cannot be reused for a different record.

The voucher response's `campaign_cancelled` field helps the customer UI show refund eligibility. The Anchor program makes the final decision: the owner of an unused voucher can request a full escrow refund after offer cancellation or voucher expiry. `POST /api/v1/vouchers/{id}/refund-confirm` does not mark a voucher `refunded` in PostgreSQL until it verifies the completed on-chain transfer. An expired voucher may remain `active` in the database so its owner can still request a refund.

`VALIDEX_ADMIN_WALLET` accepts only a Solana public key. When empty, admin operations are disabled. The API re-checks admin identity against that address on every request. `POST /api/v1/vouchers/scan` is available only to a verified merchant owner or active QR staff member; it checks database ownership/status/expiry and Solana voucher/offer accounts together. Failed or unauthorized scans create `security.*` audit events visible at `GET /api/v1/admin/audit?suspicious_only=true`. Staff receive no payout-signing authority.

The current rate limiter uses a fixed 60-second window **per API process**: 10 login challenge/verify requests, 30 QR scans, and 120 other requests per IP. `X-Forwarded-For` is not trusted. Multiple API replicas need Redis or another shared limit store. For an existing PostgreSQL database, apply `migrations/001_merchant_staff.sql` to add the staff table; `VALIDEX_AUTO_CREATE_SCHEMA=true` creates it in development.
