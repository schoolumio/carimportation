import Link from "next/link";
import { PageHeader, Notice } from "@/components/ui";
import { JOURNEY, STATE_LABEL, PATH_LABEL } from "@/server/orders/state-machine";

export const metadata = { title: "How it works" };

const DETAIL: [string, string][] = [
  ["1. Select a vehicle or request one", "Choose a listed vehicle, or submit a sourcing request. Listings state whether the car is still with the overseas seller, at auction, already purchased, already shipped, or in Nigeria — only statuses that make sense for the listing type can be selected by the seller."],
  ["2. Receive an itemised quote", "We calculate the current itemised cost and delivery range. You see the vehicle price, importation and logistics costs, estimated taxes and clearing charges, platform and dealer fees, the amount payable now, remaining estimated costs, exclusions, assumptions and the quote expiry."],
  ["3. Review and accept terms", "Accepting a quote creates an order and an immutable contract record: the agreed scope, settlement schedule, inspection period, cancellation conditions and exclusions."],
  ["4. Identity and compliance checks", "Depending on transaction value and applicable law, we verify your identity (and source of funds for larger orders) before issuing payment instructions."],
  ["5. Pay with your unique reference", "You receive payment instructions for the authorised payment arrangement. Funds are confirmed only from a verified provider event or reconciled bank transaction."],
  ["6. Funds protected", "The payment is recorded against the protected-funds arrangement and in our double-entry ledger. It is not paid to the seller at this point."],
  ["7. Purchase and inspection", "For vehicles not yet bought, purchasing begins only when the agreed conditions are met. The purchase invoice and inspection report are uploaded and reviewed by our team — sellers cannot self-verify."],
  ["8. Export, shipping and transit", "Collection, export documents, vessel booking, departure (with bill of lading) and transit updates are recorded with evidence. If the ETA changes, you see the original estimate, the new one and why."],
  ["9. Arrival, customs and release", "Arrival is recorded with documentation. A licensed clearing partner records assessment, duties paid and release evidence."],
  ["10. Delivery and inspection period", "The vehicle is delivered in Lagos with a signed handover. You then have the contractual inspection period to accept the vehicle or raise a documented discrepancy."],
  ["11. Settlement and completion", "Funds are released to the right beneficiaries at each verified milestone, after two separate finance approvals, and never while a dispute is open. Final documents and receipts remain in your account."],
];

export default function HowItWorks() {
  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader title="How it works" subtitle="A structured, auditable process from overseas to Lagos." />
      <ol className="space-y-4">{DETAIL.map(([t, d]) => <li key={t} className="card card-pad"><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{d}</p></li>)}</ol>
      <h2 className="mt-10 text-xl font-bold">Not every order follows the same path</h2>
      <p className="muted mt-1">The milestones depend on where the vehicle is when you buy it:</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Object.entries(JOURNEY).map(([path, states]) => (
          <div key={path} className="card card-pad">
            <p className="font-semibold">{PATH_LABEL[path as keyof typeof PATH_LABEL]}</p>
            <p className="mt-1 text-xs text-slate-600">{states.map((s) => STATE_LABEL[s]).join(" → ")}</p>
          </div>
        ))}
      </div>
      <div className="mt-6"><Notice tone="info">Alternative outcomes are handled explicitly: a failed auction or purchase, an inspection that finds material issues, and cancellations each have their own recorded steps and refund assessment. See the <Link href="/legal/refunds-disputes" className="link">cancellation, refund and dispute policy</Link>.</Notice></div>
    </div>
  );
}
