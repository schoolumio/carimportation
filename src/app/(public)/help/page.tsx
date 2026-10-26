import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Help centre" };

const TOPICS: { title: string; items: [string, string][] }[] = [
  { title: "Buying", items: [
    ["What is the difference between the three quote types?", "A fixed-price quote is offered only when every included cost is genuinely fixed. An estimated landed-cost quote identifies variable government, shipping, currency or third-party charges. A sourcing quote is used when the exact vehicle has not been purchased yet, so the final acquisition cost is not known."],
    ["How long is a quote valid?", "Each quote shows its expiry. After that, prices and exchange rates are recalculated with a new quote."],
    ["Why do I need to verify my identity?", "We verify identity based on transaction value, payment method and applicable law (including anti-money-laundering obligations) before issuing payment instructions."],
  ] },
  { title: "Payments", items: [
    ["I paid but my order still says awaiting payment", "Payments are confirmed only from verified provider or bank records, which can take time for bank transfers. Make sure you used the exact payment reference. You can upload your transfer receipt to prompt a check, but a receipt alone does not confirm payment."],
    ["Can I pay in instalments?", "Partial payments are recorded but the order only proceeds when the full upfront amount is confirmed."],
    ["What are additional charges?", "If a cost arises that was not in your quote (for example terminal storage due to a vessel delay), it must be submitted with evidence, reviewed by operations and approved by you before it is charged — unless it falls under a clause disclosed in your contract."],
  ] },
  { title: "Delivery & tracking", items: [
    ["Why did my ETA change?", "We update estimates only with supporting information (e.g. a carrier schedule notice). Your order page shows the original estimate, every revision and the reason."],
    ["What happens at delivery?", "The delivery partner records the handover with evidence. Your inspection period starts then; accept the vehicle or report a discrepancy within the period stated in your contract."],
  ] },
  { title: "Disputes & refunds", items: [
    ["How do I raise a dispute?", "Open your order and choose “Report a problem”. Describe the issue and attach evidence. Eligible unreleased funds are frozen while we investigate."],
    ["Will I get a full refund?", "Refunds come from unreleased funds held for your order. Costs already irreversibly incurred may not be refundable unless the contract and recovery arrangements support it."],
  ] },
];

export default function Help() {
  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader title="Help centre" subtitle={<>Can&apos;t find an answer? <Link className="link" href="/account/support">Contact support</Link>.</>} />
      <div className="space-y-8">
        {TOPICS.map((t) => (
          <section key={t.title}>
            <h2 className="text-lg font-semibold">{t.title}</h2>
            <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {t.items.map(([q, a]) => <details key={q} className="p-4"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-2 text-sm text-slate-600">{a}</p></details>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
