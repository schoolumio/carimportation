import { Notice, PageHeader } from "@/components/ui";
import { CATEGORY_LABEL } from "@/server/disputes/service";

export const metadata = { title: "Cancellation, refund & dispute policy" };

export default function Policy() {
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Cancellation, refund & dispute policy" subtitle="Draft — version 2026-10-pilot-v1" />
      <Notice tone="warning" title="Draft for legal review">Final refund rights depend on the signed contract, the payment partner&apos;s capabilities and applicable consumer-protection law.</Notice>
      <div className="prose-legal">
        <h2>Cancellation before payment</h2><p>You may cancel an order at any time before payment is confirmed, at no cost. The vehicle reservation is released.</p>
        <h2>Cancellation after payment</h2><p>After payment, cancellation is handled by our operations team. We refund unreleased funds held for your order, less any costs already irreversibly incurred under your contract (for example a completed auction purchase, freight paid or duties paid), unless those costs can be recovered.</p>
        <h2>Failed purchase or inspection</h2><p>If an auction is lost, a supplier cannot sell, or an inspection finds material issues, you may cancel and receive a refund of unreleased funds, or accept the findings in writing and continue.</p>
        <h2>Raising a dispute</h2><p>You can raise a dispute for:</p><ul>{Object.values(CATEGORY_LABEL).map((c) => <li key={c}>{c}</li>)}</ul>
        <h2>What happens next</h2><ul><li>Eligible unreleased funds are frozen where the legal and provider arrangement permits.</li><li>The seller is asked to respond within the response deadline (default 3 days).</li><li>Our team investigates and collects evidence from all parties.</li><li>An authorised manager issues a documented decision: full refund, partial refund, release to the seller, or remediation.</li><li>Any refund requires approval by two finance officers before it is paid.</li></ul>
        <h2>Delivery condition</h2><p>Condition disputes must be raised within the inspection period stated in your contract, with photos or an inspection report.</p>
      </div>
    </div>
  );
}
