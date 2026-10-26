# Nigerian regulatory assessment (for professional review)

> This is a product team's working assessment, **not legal advice**. Every item below must be confirmed by a qualified Nigerian legal practitioner, a compliance officer and a tax adviser against current law and regulator publications before accepting customers or funds. The application makes no claim of holding any licence, approval or partnership.

## 1. Holding and moving customer funds (highest priority)
- The product design assumes customer funds are held by an **authorised third party** (a licensed bank or other CBN-authorised institution offering escrow/trust/safeguarding arrangements), not by the platform's own operating account.
- Questions for counsel: Does the intended model (collecting buyer funds and instructing staged release to dealers and service providers) fall within activities regulated by the CBN (e.g. under the Banks and Other Financial Institutions Act 2020 or CBN payment-service licensing frameworks)? Which partner categories can lawfully provide it, and what contract structure is required?
- Before go-live, verify for the chosen partner: current authorisation, settlement model (full vs partial release), account structure (pooled vs per-order sub-accounts), transaction limits, refund and chargeback procedures, dispute procedures, reporting and reconciliation APIs.
- **Manual pilot**: only under a documented, legally reviewed arrangement (e.g. a designated account held by an appropriate party). The UI labels it as “not automated escrow”.

## 2. AML/CFT and KYC
- Money Laundering (Prevention and Prohibition) Act 2022 and related regulations; possible designation of motor-vehicle dealers as Designated Non-Financial Businesses and Professions, with registration and reporting obligations (e.g. via SCUML / NFIU) — **confirm applicability to the platform and to dealers**.
- Product supports: identity verification before payment, enhanced due diligence threshold, audit trail, document retention. **Missing**: sanctions/PEP screening provider, suspicious-transaction reporting workflow, cash-threshold reporting rules, BVN/NIN verification API.

## 3. Data protection
- Nigeria Data Protection Act 2023 and Nigeria Data Protection Commission requirements (lawful basis, privacy notice, data-subject rights, security, possible registration as a data controller of major importance, cross-border transfer rules, breach notification).
- Product supports: encryption of sensitive fields, private documents, access controls, audit logs, draft privacy policy. **Missing**: DPIA, retention schedule sign-off, DPO appointment, processor agreements with hosting/email/SMS vendors.

## 4. Consumer protection
- Federal Competition and Consumer Protection Act 2018 (FCCPC): accurate representations, fair terms, refund rights, complaints handling.
- Product supports: itemised quotes, no guaranteed totals unless fixed, disclosed exclusions, contract snapshot with hash, dispute process. Terms and policies in the app are **drafts**.

## 5. Vehicle importation and customs
- Nigeria Customs Service Act 2023, ECOWAS Common External Tariff, import prohibition lists and any vehicle-age or right-hand-drive restrictions in force, Form M / pre-arrival documentation requirements, valuation rules.
- Clearing must be performed by **licensed customs agents**; freight forwarding may require registration with CRFFN. The platform does not act as a customs agent.
- Pricing rules for duty, levies and VAT in the seed data are **placeholders** marked unverified; real rates must be entered with citations and verified.

## 6. Tax
- VAT on platform fees and on imports; withholding tax on payments to service providers; company income tax; e-invoicing/tax registration obligations — confirm with a tax adviser. Decide whether the platform is principal or agent for each revenue line (affects VAT base and revenue recognition).

## 7. Commercial and corporate
- Business registration (CAC), operating permits for Lagos, dealer agreements (commission, liability, chargebacks), partner SLAs, insurance (marine cargo, goods in transit, professional indemnity).

## 8. Messaging
- WhatsApp Business API requires an approved Meta business account and pre-approved templates; SMS sender ID registration with relevant Nigerian authorities/aggregators; marketing consent rules.

## Decision log template
| Topic | Question | Adviser | Decision | Date | Product change |
|---|---|---|---|---|---|
