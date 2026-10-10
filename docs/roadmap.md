# MVP delivery roadmap

For the most current completion evidence and deployment blockers, see the [hackathon submission pack](hackathon-submission.md). A checked item means code exists, not necessarily that a real devnet transaction has been demonstrated.

## M1 — Foundation

- [x] Monorepo, local environment, and health checks
- [x] PostgreSQL core data model and campaign API
- [x] Inventory, date, buyer-limit, commission, and voucher hashing rules
- [x] Customer marketplace

## M2 — Wallet identity

- [x] Short-lived, single-use login challenge
- [x] Solflare and Phantom message signing
- [x] Ed25519 verification and short-lived access token
- [x] Merchant application, admin review, and role-protected publishing
- [ ] Detailed admin role matrix

## M2.5 — Product demo

- [x] Offer details and capacity
- [x] Wallet-specific QR voucher page
- [x] Merchant offer management and sharing
- [x] Camera and manual QR verification
- [x] Solana Devnet balance display
- [x] English UI with a saved light/dark preference

## M3 — Anchor escrow

- [x] Platform, merchant, campaign, buyer-counter, and voucher PDAs
- [x] Purchase, redemption with a 2% fee, cancellation, and refund paths
- [x] Pure rule unit-test source for mint, authority, replay, time, limits, and split math
- [ ] Run Rust tests, SBF build, and validator-level account/transfer integration tests

## M4 — Chain integration

- [x] Encrypted voucher secret and `pending_chain` purchase intent
- [x] Client transaction builders and wallet signing flow
- [x] RPC finality tracker, proof checks, signature replay protection, and pending recovery
- [ ] Devnet deployment and real Solflare end-to-end transaction evidence

## M5 — Operations and submission

- [x] Merchant approval, QR staff access, audit events, and process-local rate limiting
- [x] Demo content, architecture diagram, English submission copy, and video outlines
- [ ] Distributed rate-limit store, threat review, load testing, and devnet E2E tests
- [ ] Record and submit pitch and product-demo videos
