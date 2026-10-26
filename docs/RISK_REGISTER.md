# Risk register

Likelihood/Impact: H/M/L. Owner is the accountable function once the business is staffed.

| # | Risk | L | I | Mitigation in product | Remaining action | Owner |
|---|---|---|---|---|---|---|
| R1 | Operating customer-fund holding without the right authorisation | H | H | No live escrow; sandbox clearly labelled; `LIVE_PARTNER` refuses to start | Contract an authorised partner; legal opinion on the operating model | CEO / Legal |
| R2 | Payment fraud (fake receipts, spoofed webhooks) | H | H | Receipts never confirm payment; HMAC-signed webhooks with timestamp tolerance; maker-checker manual confirmations; reconciliation | Partner-specific signature verification; IP allow-listing | Finance / Eng |
| R3 | Double processing / double charging | M | H | Unique webhook ids, provider txn ids, ledger refs, notification dedupe; fixed quote items cannot be re-charged | Load test concurrent webhooks against live partner | Eng |
| R4 | Wrong customs duty / tax estimates | H | M | Rules are dated, cited, versioned, flagged “unverified” until a second admin verifies; estimates show ranges; contingency; additional costs need approval | Populate official rates with citations; periodic review | Operations / Tax adviser |
| R5 | FX movement between quote and purchase | H | M | FX snapshots with source; uncertainty band; quote expiry | Authorised FX source; hedging/pricing policy | Finance |
| R6 | Vehicle misrepresentation by dealers | M | H | Provenance labels; independent inspections; duplicate VIN detection; reports; disputes freeze funds; dealer suspension | Independent inspection partners per origin country | Trust & Safety |
| R7 | Dealer/supplier failure after funds released | M | H | Staged release only after verified milestones; dual approval; dealer verification | Contractual recourse, dealer bonds/insurance | Legal / Finance |
| R8 | Shipping delays, port congestion, customs holds | H | M | No guaranteed dates; ETA revisions with reasons; SLA stale-order alerts | Carrier data integration; clearing partner SLAs | Operations |
| R9 | Data breach (IDs, bank details) | M | H | Encryption at rest, private storage, signed links, RBAC, audit, MFA available, CSP | Enforce MFA for staff; pen test; managed secrets/KMS | Security |
| R10 | Insider abuse (staff releasing funds) | L | H | Maker-checker enforced in code and DB constraints; audit hash chain; self-approval blocked | Segregation of duties in staffing; periodic audit review | Finance / Compliance |
| R11 | AML/KYC obligations unmet | M | H | Identity verification gate; EDD threshold; audit trail | Confirm obligations (NFIU/SCUML), sanctions screening provider, STR process | Compliance |
| R12 | Consumer-protection disputes over terms | M | M | Clear quote types, exclusions, contract snapshot with hash, inspection period | Finalise terms with counsel (FCCPA) | Legal |
| R13 | In-memory rate limiter ineffective across instances | M | L | Works per instance | Move to Redis/DB limiter before horizontal scaling | Eng |
| R14 | Partial refunds / milestone release not supported by chosen provider | M | M | Provider `capabilities` flags; manual-pilot path | Redesign settlement schedule to provider capabilities; disclose to buyers | Product / Finance |
| R15 | Import prohibitions (e.g. vehicle age, RHD) | M | H | Steering field on listings | Encode confirmed prohibitions as listing validation rules | Legal / Operations |
