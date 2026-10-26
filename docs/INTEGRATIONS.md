# Integrations

All external dependencies sit behind adapters. Nothing below is claimed to be connected unless marked **implemented**.

## Payments / escrow (`src/server/payments`)
Interface `PaymentProvider` (`provider.ts`): `createCollection`, `refund`, `payout`, `statement`, `verifyWebhook`, `parseWebhook`, plus `capabilities` (bank transfer, cards, partial refunds, milestone release, webhooks, automated reconciliation).

| Adapter | Status |
|---|---|
| `SANDBOX` | **Implemented (simulation).** HMAC-SHA256 signed webhooks (`x-sandbox-signature` over `timestamp.body`, 5-minute tolerance), provider-side records in `SandboxProviderRecord` for reconciliation. |
| `MANUAL_PILOT` | **Implemented.** Pilot bank account from settings; finance maker records statement credit, different checker approves; refunds/payouts require the bank transfer reference. |
| `LIVE_PARTNER` | **Not implemented** — startup refuses this value. |

### Adding a live partner
1. Complete the checks in `docs/COMPLIANCE.md` §1.
2. Create `src/server/payments/<partner>.ts` implementing `PaymentProvider`; map partner events to `NormalizedPaymentEvent`; implement their signature scheme exactly as documented (constant-time compare, replay window).
3. Register in `registry.ts`; add `/api/webhooks/payments/<partner>/route.ts` calling `handlePaymentWebhook`.
4. Set `capabilities` truthfully. If partial refunds or staged release are unsupported, change the settlement schedule (`settlement.ts`) and the buyer-facing explanation before launch.
5. Implement `statement()` against the partner's reporting API; schedule reconciliation; alert on exceptions.
6. Never store card data — use the partner's hosted checkout/tokenisation (PCI DSS scope reduction).

## Shipping / tracking (`src/server/logistics`)
Implemented: manual verified updates by assigned partners (`TrackingEvent.source = MANUAL_VERIFIED`), shipments/legs, ETA revisions with reasons. Not implemented: carrier/terminal APIs. To add one, write a sync job that inserts `TrackingEvent` with `source = PROVIDER_API` and proposes `reviseEta` with the carrier message as supporting info; never fabricate positions. Set `ShippingProvider.integration = LIVE` only when connected.

## Exchange rates (`ExchangeRateSnapshot`)
Implemented: admin-entered snapshots with source citation. Recommended: scheduled job pulling from an authorised source, storing each snapshot (never overwriting) and alerting on large moves.

## Customs and tariffs
No customs system integration. Duty/levy/VAT come from `PricingRule` rows that must cite the official source and be verified by a second admin. Actual assessed amounts are captured in `CustomsRecord` by the clearing partner; differences go through cost adjustments or refunds.

## Messaging (`src/server/notifications/channels.ts`)
| Channel | Status |
|---|---|
| In-app | Implemented |
| Email | Console adapter (dev) and SMTP via nodemailer (`EMAIL_TRANSPORT=smtp`, `SMTP_URL`) |
| SMS | Console adapter only; integrate a Nigerian aggregator in `adapterFor("SMS")` |
| WhatsApp | Console adapter only; requires WhatsApp Business Platform approval and approved templates |
Unconfigured channels are marked `SKIPPED` (not retried). Failures retry with exponential backoff up to 5 attempts, then `DEAD`.

## Storage (`src/server/documents/service.ts`)
`StorageAdapter` with `LocalStorage` (disk, mode 0600). For production implement an S3-compatible adapter (private bucket, server-side encryption); keep downloads flowing through `/api/documents/[id]` so access checks and audit still apply. Public vehicle media are served from `/api/media/[key]` (consider a CDN).

## Identity verification
Manual document review by verification staff. A BVN/NIN verification provider can be added in `compliance/service.ts` to pre-fill or auto-pass checks; keep the human review for mismatches.
