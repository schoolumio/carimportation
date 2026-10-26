# AutoVault — car importation escrow marketplace (Nigeria / Lagos)

> **Status: working MVP in sandbox mode. Not yet able to accept real customer funds.**
> No authorised escrow/safeguarding partner is integrated. All payments, tracking updates and listings created by the seed script are **demonstration data**. See [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) before any live use.

AutoVault lets customers in Nigeria buy foreign-used vehicles that are still overseas and have them delivered to Lagos, with:

- **Transparent landed cost** — itemised quotes (vehicle, logistics, estimated duties/VAT, clearing, fees, contingency) where every line states its source rule, whether it is fixed / quoted / estimated / variable, who receives it, when it is payable and whether it is refundable. Three quote types: fixed-price, estimated landed-cost, sourcing.
- **Milestone-based protected payments** — a payment-provider abstraction (sandbox + staff-verified manual pilot), signed idempotent webhooks, a double-entry ledger enforced by database triggers, maker-checker settlement/refund/payout approvals, dispute freezes and reconciliation.
- **Auditable order state machine** — explicit transitions per purchase path (sourcing, auction, already purchased, in transit, local stock), with authorised performers, record-level checks, required evidence, notifications and an append-only, hash-chained audit log.
- **Tracking** — shipments, legs, tracking events, original vs revised ETAs with reasons, customs records, delivery evidence and an inspection/acceptance period.
- **Marketplace** — platform inventory, verified third-party dealers, customer sourcing requests and offers, listing moderation, duplicate/fraud flags, separate dashboards for buyers, dealers, partners and staff roles.

The brand name and palette are configurable (`NEXT_PUBLIC_BRAND_*` env vars, CSS variables in `src/app/globals.css`).

## Quick start (macOS / Linux)

Requirements: Node.js ≥ 20.11, PostgreSQL 14+.

```bash
cp .env.example .env            # then edit secrets (see docs/DEPLOYMENT.md#environment-variables)
npm install
createdb autovault_dev          # or create it with psql / pgAdmin
npx prisma migrate deploy       # applies migrations incl. integrity triggers
npm run db:seed                 # demo data (empty database only)
npm run dev                     # http://localhost:3000
npm run worker                  # in a second terminal: notifications, expiry, reconciliation
```

**Windows (Command Prompt):** see [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md).

### Demo accounts (password `Demo-pass-2026`)

| Email | Role |
|---|---|
| buyer@autovault.test | Buyer (identity verified; has orders in transit, awaiting payment, completed, disputed) |
| buyer2@autovault.test | Buyer (identity not verified → order waiting on compliance) |
| dealer@autovault.test / dealer2@autovault.test | Approved dealers |
| dealer3@autovault.test | Dealer applicant under review |
| admin@autovault.test / admin2@autovault.test | Super administrators (two, so maker-checker can be demonstrated) |
| ops@ · finance1@ · finance2@ · verify@ · support@ | Operations, finance maker, finance checker, verification, support |
| logistics@ · clearing@ · delivery@ | Partners assigned to the in-transit demo shipment |

In sandbox mode the buyer order page shows a **“Simulate bank transfer”** button that makes the sandbox provider emit a signed webhook, exercising the real verification path.

## Tests

```bash
createdb autovault_test         # dedicated test DB; tests refuse to run on a DB not ending in _test
npm test                        # 60 tests against real PostgreSQL
npm run typecheck && npm run lint && npm run build
```

Covers: registration/login/lockout/reset/MFA, RBAC & record-level access, listing creation/moderation/duplicates, availability rules per listing type, quote calculations & expiry, order state transitions & evidence, duplicate/concurrent/forged webhooks, ledger balancing & immutability, reconciliation, refunds, maker-checker settlement, dispute fund freezes, additional-cost approvals, shipment/ETA history, document access & signed links, dealer isolation, notification dedupe/retries/dead-lettering, audit chain integrity.

## Documentation

| Document | Contents |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements, scope, MVP phases |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, modules, data model, state machine, ledger, workflows |
| [docs/RISK_REGISTER.md](docs/RISK_REGISTER.md) | Product, financial, regulatory, operational and security risks |
| [docs/COMPLIANCE.md](docs/COMPLIANCE.md) | Nigerian regulatory assessment and items needing professional confirmation |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Payment/escrow, shipping, FX, customs, messaging, storage adapters |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Environment variables, database setup, deployment, Docker |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Backup/restore, monitoring, key rotation, retention, incident runbooks |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Administrator, finance, operations, dealer and partner guide |
| [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md) | Windows Command Prompt setup |
| [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) | What is implemented, tested, mocked, and required before live funds |
