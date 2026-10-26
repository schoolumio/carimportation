# Administrator, finance, operations, dealer and partner guide

## Roles at a glance
| Role | Console | Typical tasks |
|---|---|---|
| Super administrator | /admin | Users & roles, settings, pricing, everything below |
| Operations | /admin | Order milestones, shipments & partner assignment, listings, cost reviews, platform sourcing offers |
| Finance | /admin/finance | Manual pilot confirmations, settlement releases, refunds, payouts, reconciliation |
| Verification | /admin | Dealer verification, listing moderation, fact verification, identity/compliance |
| Support | /admin/support | Conversations, disputes intake, refund requests |
| Dealer | /dealer | Listings, inquiries, orders, sourcing offers, finance, disputes |
| Logistics / clearing / delivery partner | /partner | Assigned shipments only |

Two-person rules (enforced): finance maker ≠ checker for manual payments, settlements, refunds; cost submitter ≠ reviewer; pricing rule creator ≠ verifier; nobody verifies their own dealer org, listing or identity; you cannot change your own roles.

## Operations: running an order
1. **Compliance** — orders above the identity threshold wait until Admin → Compliance verifies the buyer's ID; EDD checks need a documented pass.
2. **Payment** — the system moves the order to *Funds protected* only after a verified payment.
3. **Purchase** (sourcing/auction) — record *Purchase authorised* (requires full funds held), then the dealer/logistics partner records *Purchase completed* with the invoice.
4. **Inspection** — review the report and record *Inspection completed* (evidence required). This makes the purchase-tranche settlement eligible. Record *Inspection issues found* if material problems exist; then cancel or obtain written buyer acceptance.
5. **Shipment** — open the shipment record, set the initial ETA range, assign logistics, clearing and delivery partners.
6. Partners record export, booking (vessel/booking ref required), departure (B/L required), arrival, customs and release (customs record must be *Released*), local transport, handover.
7. **Delivery** — delivery partner records recipient, time and handover evidence; the buyer's inspection period starts automatically.
8. **Acceptance** — buyer accepts, or the worker auto-accepts after the period if no dispute is open. Final settlements become eligible.

## Finance
- **Manual pilot**: record only credits visible on the bank statement (amount + statement reference). A different finance user approves. Buyer receipts are prompts, not proof.
- **Settlements**: Finance → Settlement queue → *Request*; a second user *Approves*. Frozen items (dispute) cannot be released.
- **Refunds**: requested from an order or dispute decision; a different finance user approves. Only unreleased funds can be refunded.
- **Payouts**: dealers request from their released balance; approve after confirming bank-account verification.
- **Reconciliation**: daily via the worker; run ad hoc from the Finance page. Investigate any mismatch, missing-internal transaction or non-zero position difference.

## Verification
- **Dealers**: review each check's evidence → Pass/Fail. Approval requires identity, CAC registration, address and bank-ownership checks to pass. Use *Additional information required* with a clear request. Suspension hides all listings.
- **Listings**: approve only when photos are of the actual vehicle, disclosures are complete and duplicate flags are resolved. Use *Fact verification* only with an attached evidence document.

## Pricing administrators
- Never enter a government rate without the official citation. A second administrator must verify it. Unverified rules show an “Unverified rate” warning on every quote.
- Editing a rule creates a new version from the effective date; older quotes keep their recorded rule version.
- Record exchange-rate snapshots with their source.

## Dealers
1. Apply (/dealers/apply), then upload evidence for each check in **Verification**.
2. After approval: **Inventory → New listing**. Choose the listing type first — only matching availability statuses can be selected. Add real photos, then *Submit for review*. Material edits to a published listing send it back to review.
3. **Inquiries**: reply promptly — your response rate is public.
4. **Orders**: record the milestones assigned to dealers (e.g. purchase completed with invoice, export preparation, booking). You cannot confirm payments, inspections or release funds.
5. **Additional costs**: submit with evidence; the buyer is charged only after internal review and buyer approval.
6. **Finance**: settlements show what is held, eligible, frozen and released; request payouts from the released balance. Commission is deducted under your agreement and never added to the buyer's price.
7. **Disputes**: respond before the deadline with evidence.

## Partners
Open **/partner**; you only see shipments assigned to you. Record milestones with evidence, add tracking updates (mark internal if not for the buyer), revise ETAs with a reason and supporting information, update customs records (clearing) and record delivery handover (delivery). All entries are timestamped and cannot be edited afterwards — add a correcting update instead.
