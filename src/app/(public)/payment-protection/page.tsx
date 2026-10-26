import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { MILESTONE_LABEL } from "@/server/settlement/settlement";
import { brand } from "@/config/brand";

export const metadata = { title: "Escrow & payment protection" };

export default function PaymentProtection() {
  const provider = process.env.PAYMENT_PROVIDER ?? "SANDBOX";
  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader title="Escrow & payment protection" subtitle="How your money is held, verified and released." />
      <div className="space-y-4">
        {provider === "SANDBOX" && <Notice tone="warning" title="Current status: demonstration only">No live escrow or safeguarding partner is connected. All payments in this environment are simulated and no real money is accepted. Live protected payments will only be enabled once an authorised Nigerian financial institution or escrow/safeguarding partner has been contracted and its authorisation verified.</Notice>}
        {provider === "MANUAL_PILOT" && <Notice tone="warning" title="Current status: manual pilot">Payments are made by bank transfer to a designated pilot account and confirmed manually by two finance staff against bank statements. This is not automated escrow and operates only under a documented, legally reviewed arrangement.</Notice>}
        <div className="card card-pad prose-legal">
          <h2>What we do — and what we don&apos;t</h2>
          <p>{brand.name} is a marketplace and coordination platform. We are not a bank and we do not claim to be a licensed escrow provider. Protected funds are held by an authorised partner under a contract that defines when money may be released.</p>
          <h2>How payment is confirmed</h2>
          <ul>
            <li>Each order has a unique payment reference.</li>
            <li>Payment is confirmed only from a cryptographically signed event from the payment provider, or (in a manual pilot) a bank-statement entry recorded by one finance officer and approved by a second.</li>
            <li>A screenshot or transfer receipt is never treated as proof of payment. Uploading one only asks our finance team to check the statement.</li>
            <li>Every movement is recorded in a double-entry ledger that is reconciled daily against the provider.</li>
          </ul>
          <h2>How money is released</h2>
          <p>Your contract shows a settlement schedule. A typical schedule releases funds at these milestones:</p>
          <ul>{Object.values(MILESTONE_LABEL).map((m) => <li key={m}>{m}</li>)}</ul>
          <p>A milestone counts only when it has been recorded through our controlled workflow with evidence (for example, an inspection report reviewed by our operations team or a bill of lading). Dealers cannot trigger payments by changing a status. Every release requires two different authorised finance approvers.</p>
          <p>The actual schedule depends on the selected provider&apos;s capabilities, applicable law and your signed contract. Where a provider supports only full settlement or limited refunds, we will tell you before you pay and the workflow will change accordingly.</p>
          <h2>Disputes</h2>
          <p>If you open a dispute, eligible funds that have not yet been released are frozen (where the legal and provider arrangement permits) while we investigate, collect evidence from both sides and issue a documented decision.</p>
          <h2>Refunds</h2>
          <p>Refunds are paid from unreleased funds held for your order and require approval by two finance officers. Costs already irreversibly incurred — for example a completed auction purchase, freight already paid or duties already paid — may not be refundable unless the contract and actual recovery arrangements allow it.</p>
        </div>
        <p className="text-sm"><Link className="link" href="/legal/refunds-disputes">Read the full cancellation, refund and dispute policy</Link></p>
      </div>
    </div>
  );
}
