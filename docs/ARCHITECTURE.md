# Architecture

## Stack
Next.js 15 (App Router, React 19, server components + server actions) · TypeScript (strict) · Tailwind CSS 3 · PostgreSQL 16 · Prisma 6 · Zod · Vitest. Single deployable web app + a separate worker process sharing the same code and database. No microservices; integrations sit behind adapters.

```
Browser ──► Next.js (pages, server actions, /api routes)
                 │            ▲
                 ▼            │ signed webhooks
           src/server/*  ◄────┘  (payments provider)
           domain services
                 │
                 ▼
            PostgreSQL ◄──── worker (jobs: notifications, acceptance expiry,
                 ▲                    quote/listing expiry, daily reconciliation)
                 │
     Storage adapter (local disk → S3-compatible in production)
```

## Module layout (`src/server`)
| Module | Responsibility |
|---|---|
| `auth` | scrypt passwords, DB sessions (hashed tokens, revocation), lockout, reset tokens, TOTP MFA, roles/permissions, `Actor` model, rate limiting |
| `inventory` | listings, specs, media, fact provenance, inspections, moderation, duplicates/flags, search, inquiries, saved vehicles |
| `pricing` | pure landed-cost calculator, dated/versioned rules, FX snapshots, delivery estimates |
| `quotes` | persisting quotes and line items, expiry |
| `orders` | state machine definitions (pure), transition engine (only writer of `Order.state`), order creation + contract, compliance gating, acceptance expiry |
| `payments` | provider interface, sandbox + manual-pilot providers, webhook processing, refunds, reconciliation |
| `ledger` | double-entry posting, reversals, balances, trial balance |
| `settlement` | settlement plan, milestone eligibility, maker-checker release, dispute freeze, dealer payouts |
| `logistics` | shipments, partner assignment, tracking, ETA revisions, customs, delivery, additional costs |
| `dealers` | applications, verification checks/status, commercial agreements, metrics |
| `documents` | storage adapter, upload validation (magic bytes), access policy, signed links |
| `notifications` / `jobs` | idempotent notifications, channel adapters, DB-backed job queue (`FOR UPDATE SKIP LOCKED`) with backoff and dead-lettering |
| `disputes`, `support`, `sourcing`, `compliance`, `reporting`, `admin`, `audit` | as named |
| `web` | Next.js glue: session cookie ↔ Actor, action helpers |

Services receive an explicit `Actor` (user or system) and perform their own permission + record-level checks, so they are safe regardless of which UI calls them and are directly testable.

## Data model highlights (`prisma/schema.prisma`)
~60 tables covering every entity in the brief. Money is `Decimal(18,2)`, FX `Decimal(18,8)`, percentages `Decimal(9,4)`; arithmetic uses `Prisma.Decimal` only. All timestamps `timestamptz` (UTC), rendered in the viewer's timezone (`LocalTime` component).

Database-level guarantees (`prisma/migrations/20261026000100_integrity_guards`):
- `AuditLog`, `OrderTransition`, `TrackingEvent`, `LedgerEntry`, `LedgerTransaction`, `EtaRevision` reject UPDATE/DELETE.
- Deferred constraint trigger: every ledger transaction balances per currency at commit.
- Ledger entry amounts > 0; entry currency must equal account currency.
- Check constraints: approver ≠ requester for refunds, settlements and manual payment confirmations.

## Order state machine
States: `ORDER_CREATED → COMPLIANCE_CHECK → AWAITING_PAYMENT → FUNDS_CONFIRMED → FUNDS_PROTECTED → PURCHASE_AUTHORIZED → PURCHASE_COMPLETED → INSPECTION_COMPLETED → EXPORT_PREPARATION → SHIPMENT_BOOKED → DEPARTED → IN_TRANSIT → ARRIVED_NIGERIA → CUSTOMS_CLEARANCE → RELEASED_FROM_PORT → LOCAL_TRANSPORT → READY_FOR_HANDOVER → DELIVERED → ACCEPTANCE_PERIOD → ACCEPTED → SETTLEMENT → COMPLETED`, plus `PURCHASE_FAILED`, `INSPECTION_FAILED`, `CANCELLED`, `REFUNDED`. (Vehicle selected / quote generated / quote accepted are quote states before an order exists.)

Each transition defines source states, allowed performers (`SYSTEM`, buyer owner, or a permission), applicable paths, evidence requirement, buyer notification and whether an open dispute blocks it. The engine additionally enforces guards backed by records — e.g. `PURCHASE_AUTHORIZED` requires the ledger to show the full upfront amount held and an unfrozen protected-funds reference; `DELIVERED` requires a delivery record; `RELEASED_FROM_PORT` requires a released customs record. `FUNDS_CONFIRMED`/`FUNDS_PROTECTED` can only be performed by the system after a verified payment. Each transition writes an immutable `OrderTransition` with sequence, actor, role, description, evidence IDs, an audit event and a deduplicated notification.

Paths: `SOURCE_AND_IMPORT`, `AUCTION_PURCHASE`, `PURCHASED_STOCK`, `IN_TRANSIT_STOCK`, `LOCAL_STOCK`.

## Money flow
```
Buyer transfer ─► Provider ─signed webhook─► WebhookEvent (unique) ─► ProviderTransaction (unique)
   ─► Ledger: DR Safeguarded funds / CR Buyer funds held (order)       [ref collection:<provider>:<txn>]
   ─► PaymentIntent SUCCEEDED ─► FUNDS_CONFIRMED ─► EscrowReference ─► FUNDS_PROTECTED
Milestone reached (verified transition) ─► SettlementInstruction ELIGIBLE
   ─► finance A requests ─► finance B approves ─► DR Buyer funds held / CR Dealer payable | Third-party payable | Platform revenue
   ─► third parties paid via provider payout (DR payable / CR Safeguarded)
Dealer payout request ─► reviewer approves ─► DR Dealer payable / CR Safeguarded
Refund (maker-checker) ─► DR Buyer funds held / CR Safeguarded
```
Idempotency is layered: unique webhook event id, unique provider transaction id, unique ledger reference, notification dedupe keys.

Settlement plan (default, configurable %): vehicle price split into a purchase tranche (after verified purchase + inspection) and a final tranche (after acceptance); overseas logistics/freight/insurance after departure; duties/port/clearing after arrival; delivery, fees and dealer fee after acceptance; dealer commission deducted from dealer proceeds; contingency never collected upfront. Milestones that do not exist on a path roll forward to the next one.

## Security
Server-side validation (Zod) everywhere; Prisma parameterised queries; React escaping; CSP and security headers (`next.config.ts`); httpOnly SameSite cookies; Next.js server-action origin checks (CSRF); rate limits on login, MFA, reset, contact, tracking and reports; AES-256-GCM field encryption for bank accounts, ID numbers and MFA secrets; private storage + HMAC links bound to user and 5-minute expiry; upload type sniffing; role changes revoke sessions; audit log for sensitive operations.
