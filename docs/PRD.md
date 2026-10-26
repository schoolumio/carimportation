# Product requirements (concise)

## Vision
Customers in Nigeria buy vehicles that are still overseas and receive them in Lagos through a structured, transparent and secure importation process.
Promise: **“Your car, from overseas to Lagos. Transparent pricing. Protected payments. Tracked delivery.”** No arbitrary delivery-day guarantees — only evidence-based ranges.

## Users
Public visitors · Buyers · Dealers/suppliers · Overseas logistics operators · Clearing partners · Delivery partners · Support · Verification officers · Operations · Finance & escrow operations · Super administrators. Role definitions and default permissions: `src/server/auth/permissions.ts`.

## Supply channels
1. **Platform-owned inventory** — staff create listings, record sourcing/purchase evidence, set prices.
2. **Verified dealers** — onboarding with identity, CAC registration, address and bank-ownership checks; own dashboard.
3. **Customer sourcing requests** — buyers describe a car; dealers or the platform submit offers → sourcing quote → same protected order workflow.

## Core requirements and where they live
| Requirement | Implementation |
|---|---|
| Listing details incl. VIN visibility, disclosures, provenance of facts | `VehicleListing`, `VehicleSpecification`, `VehicleFactVerification`, `VehicleHistoryDisclosure`, `VehicleInspection` |
| Only appropriate availability per listing type | `AVAILABILITY_BY_TYPE` in `src/server/inventory/service.ts` (UI + server enforced) |
| Itemised landed cost with source, date, nature, paid, refundable, beneficiary | `src/server/pricing/calculator.ts`, `QuoteLineItem` |
| Three quote types | `FIXED_PRICE` only if all lines fixed, verified and NGN; `SOURCING` for unpurchased; else `ESTIMATED_LANDED_COST` |
| Explicit auditable order state machine incl. alternative paths | `src/server/orders/state-machine.ts`, `engine.ts` |
| Payment never confirmed by screenshots | Only signed provider events or maker-checker bank statement entries (`payments/service.ts`) |
| Double-entry ledger, idempotent, reversals | `src/server/ledger/ledger.ts` + DB triggers |
| Milestone settlement not triggered by dealer clicks | Milestones from verified transitions; 2-person approval (`settlement/settlement.ts`) |
| Disputes freeze unreleased funds | `disputes/service.ts`, `freezeOrderFunds` |
| Additional costs need approval | `logistics/costs.ts` |
| Tracking with original + revised ETA and reasons | `Shipment`, `EtaRevision`, `TrackingEvent` |
| Notifications: in-app, email, SMS, WhatsApp; queued, retried, deduplicated | `notifications/*`, `jobs/*` |
| Private documents, signed short-lived links | `documents/service.ts`, `/api/documents/[id]` |

## Acceptance criteria status
1. Customer selects an overseas vehicle and sees the estimated cost to Lagos — **met** (vehicle page, calculator).
2. Customer creates an order and follows progress — **met** (checkout, order page, track page).
3. Dealer manages own approved listings and assigned orders — **met** (dealer dashboard; isolation tested).
4. Administrator manages marketplace and reviews documents — **met** (admin console).
5. Shipment events appear in the buyer timeline — **met**.
6. Payment and settlement states are backed by verifiable records — **met** (ledger, provider txns, webhooks, audit).
7. Disputes follow a controlled process — **met**.
8. Unauthorised users cannot access private documents, other dealers' records or finance actions — **met and tested**.
9. Financial records reconcile and ledger entries balance — **met** (DB-enforced + reconciliation runs).
10. Runs with documented setup and passes core tests — **met** (60 tests).

## Phases
- **Phase 1 – core marketplace: implemented.** Public site, listings/search, detail, dealer onboarding & verification, admin listing management, landed-cost estimates, quotes/orders, buyer dashboard, manual-pilot payment verification (clearly labelled), manual shipment tracking, email notifications (console/SMTP), support and disputes.
- **Phase 2 – protected payments: implemented against a sandbox provider.** Webhooks, ledger, reconciliation, refunds, settlement workflows, finance dashboard, maker-checker. **Live partner integration outstanding.**
- **Phase 3 – logistics automation: interfaces only.** Manual shipment workflows complete; no carrier API, port or customs system integration.
- **Phase 4 – growth: partial.** Featured listings, dealer commercial agreements, sourcing offers, basic dealer analytics. Subscription billing not implemented (plan field only).
