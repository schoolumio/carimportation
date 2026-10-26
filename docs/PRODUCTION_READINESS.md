# Production-readiness report and checklist

**Bottom line: the application is a working, tested MVP. It is NOT ready to accept real customer funds.** The blocking items are external (authorised payment/escrow partner, legal and regulatory sign-off, verified tariff data) plus a short list of engineering hardening tasks.

## What was implemented
- Public site (18 page groups), marketplace search/filters, vehicle detail with provenance badges and live landed-cost estimate, comparison, calculator, sourcing requests, dealer directory/application, tracking lookup, legal drafts.
- Buyer dashboard: required actions, orders with timeline/evidence/ETA history, payment instructions + sandbox simulator, receipt upload (non-conclusive), additional-cost approvals, inspection acceptance, disputes, documents, contract record, quotes, sourcing offers, saved vehicles, support, notifications, profile with identity verification, MFA, sessions and password change.
- Dealer dashboard: verification evidence, inventory editor (type-dependent availability, media, documents, inspections), inquiries, orders (dealer milestones only), sourcing offers, finance statement & payouts, disputes.
- Partner console: assigned shipments, milestones, booking, tracking events, ETA revisions, customs record, delivery scheduling and handover.
- Admin console: overview & work queues, orders operations, listings moderation & fact verification, dealers verification & agreements, compliance, finance & escrow (maker-checker, reconciliation, ledger, webhooks), disputes, cost approvals, sourcing, support, trust & safety, pricing rules & FX, users/roles/permission matrix, settings/countries/locations/templates, notifications & jobs, hash-chained audit log.
- Worker: notification delivery with retries, acceptance-period expiry, quote/listing expiry, daily reconciliation.

## What was tested
- 60 automated tests (Vitest, real PostgreSQL) — see README for coverage list. All passing.
- `tsc --noEmit`, `next lint`, `next build` — clean.
- Manual/automated browser smoke test of every page for every role (Playwright) and an end-to-end buyer journey (quote → checkout → order → sandbox webhook → funds protected). Mobile layout checked for horizontal overflow.
- Live HTTP checks: forged webhook signature rejected (401), valid accepted, retry acknowledged as duplicate; unsigned document download refused (403).

## What is mocked / simulated
| Area | Status |
|---|---|
| Payment/escrow | Sandbox provider simulates collections, refunds, payouts and statements. Manual pilot is real but manual. |
| Vessel/carrier tracking | Manual verified updates only. No carrier feed. |
| Duties, levies, VAT, freight, port charges | Seed values are **placeholders/demo** and flagged unverified. |
| Exchange rates | Demo snapshots. |
| SMS / WhatsApp | Console adapters; real providers not integrated. |
| Email | Console by default; SMTP adapter available. |
| Identity verification | Manual document review; no BVN/NIN API. |
| Vehicle photos in seed | Vector illustrations labelled “Illustration · no photo”. |
| Legal pages | Drafts marked for legal review. |

## Must be completed before real customer funds
- [ ] Select and contract an authorised escrow/safeguarding partner; verify authorisation, settlement model, limits, refund/dispute procedures (COMPLIANCE.md §1).
- [ ] Implement and test the `LIVE_PARTNER` adapter, webhook route and statement reconciliation; adapt settlement schedule to real capabilities.
- [ ] Legal sign-off on operating model, terms, refund/dispute policy, privacy policy; dealer and partner contracts.
- [ ] AML/KYC programme: sanctions/PEP screening, STR workflow, applicable registrations; confirm thresholds in Settings.
- [ ] Enter official duty/levy/VAT rules with citations; second-admin verification; authorised FX source.
- [ ] Contract licensed clearing agents, forwarders, inspectors and transporters; onboard them as partner users.
- [ ] Enforce MFA for all privileged roles (currently strongly prompted, not enforced).
- [ ] Replace in-memory rate limiter with a shared store; add CAPTCHA on public forms.
- [ ] Object storage adapter with encryption and versioning; malware scanning of uploads.
- [ ] Error monitoring/tracing, uptime checks, log retention; alerting on reconciliation exceptions and DEAD jobs.
- [ ] Backups with tested restore; key management (KMS) and rotation procedure.
- [ ] Independent penetration test and code review of payment/ledger paths.
- [ ] Data-protection: DPIA, retention schedule, processor agreements, regulator registration if required.
- [ ] Real email/SMS/WhatsApp providers with approved templates and sender IDs.
- [ ] Accessibility audit (WCAG 2.1 AA) and load testing.

## Features still requiring manual operation
Payment confirmation in pilot mode; shipment milestone and ETA updates; customs records; identity verification; dealer document verification; listing moderation; dispute investigation; FX and tariff updates; payouts to third parties in pilot mode (bank reference entered manually).
