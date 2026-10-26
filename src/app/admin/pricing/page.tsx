import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { Badge, Card, Flash, Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { CATEGORY_ORDER } from "@/server/pricing/calculator";
import { BENEFICIARY_LABEL } from "@/lib/labels";
import { fxAction, pricingRuleAction, ruleActiveAction, verifyRuleAction } from "../actions";

export const metadata = { title: "Pricing rules" };

export default async function Pricing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requirePerm("pricing.manage");
  const [rules, fx] = await Promise.all([prisma.pricingRule.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] }), prisma.exchangeRateSnapshot.findMany({ orderBy: { capturedAt: "desc" }, take: 20 })]);
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeader title="Pricing rules & exchange rates" subtitle="Dated, versioned rules. Editing creates a new version; history is never overwritten." />
      <Flash sp={sp} />
      <Notice tone="warning" title="Government charges">Never invent customs duty, levy or VAT rates. Enter the official rate with its citation (e.g. tariff schedule and effective date) and have a second administrator verify it. Unverified rules are flagged on every quote.</Notice>
      <Card title="Rules">
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Code / version</th><th>Label</th><th>Calculation</th><th>Nature</th><th>Beneficiary</th><th>Effective</th><th>Verification</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">{rules.map((r) => {
            const current = r.active && r.effectiveFrom <= now && (!r.effectiveTo || r.effectiveTo > now);
            return (
              <tr key={r.id} className={current ? "" : "opacity-60"}>
                <td className="text-xs">{r.code}<br />v{r.version} {r.isDemo && <Badge tone="pending">demo</Badge>}</td>
                <td>{r.label}<br /><span className="text-xs text-slate-500">{r.category}{r.optional && " · optional"}</span></td>
                <td className="text-xs">{r.calcType === "FIXED_AMOUNT" ? `${r.currency} ${r.amount?.toFixed(2)}` : `${r.percent?.toString()}% ${r.calcType.replace("PERCENT_OF_", "of ").toLowerCase()}`}<br />±{r.uncertaintyPercent.toString()}% {JSON.stringify(r.conditions) !== "{}" && <code className="block">{JSON.stringify(r.conditions)}</code>}</td>
                <td className="text-xs">{r.nature.toLowerCase()}<br />{r.payableStage.toLowerCase()}</td>
                <td className="text-xs">{BENEFICIARY_LABEL[r.beneficiary]}</td>
                <td className="text-xs"><LocalTime iso={r.effectiveFrom} mode="date" />{r.effectiveTo && <> → <LocalTime iso={r.effectiveTo} mode="date" /></>}</td>
                <td className="text-xs">{r.verifiedAt ? <Badge tone="verified">verified</Badge> : <Badge tone="danger">unverified</Badge>}<br /><span title={r.sourceReference}>{r.sourceReference.slice(0, 60)}{r.sourceReference.length > 60 && "…"}</span></td>
                <td className="space-y-1">
                  {!r.verifiedAt && r.createdById !== actor.userId && <form action={verifyRuleAction}><input type="hidden" name="ruleId" value={r.id} /><button className="btn-secondary btn-sm">Verify</button></form>}
                  <form action={ruleActiveAction}><input type="hidden" name="ruleId" value={r.id} /><input type="hidden" name="active" value={r.active ? "0" : "1"} /><button className="btn-ghost btn-sm">{r.active ? "Deactivate" : "Activate"}</button></form>
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Card>
      <Card title="Create rule or new version">
        <form action={pricingRuleAction} className="grid gap-2 sm:grid-cols-3">
          <input name="code" className="input" placeholder="CODE (same code = new version)" required />
          <input name="label" className="input" placeholder="Customer-facing label" required />
          <select name="category" className="input">{CATEGORY_ORDER.filter((c) => !["VEHICLE", "DEALER_FEE"].includes(c)).map((c) => <option key={c}>{c}</option>)}</select>
          <select name="calcType" className="input"><option value="FIXED_AMOUNT">Fixed amount</option><option value="PERCENT_OF_VEHICLE">% of vehicle</option><option value="PERCENT_OF_CIF">% of CIF</option><option value="PERCENT_OF_DUTIABLE">% of CIF + duty + levies</option><option value="PERCENT_OF_SUBTOTAL">% of subtotal</option></select>
          <div className="grid grid-cols-2 gap-2"><input name="amount" className="input" placeholder="Amount" /><input name="currency" className="input" placeholder="CCY" maxLength={3} /></div>
          <input name="percent" className="input" placeholder="Percent" />
          <select name="nature" className="input"><option value="FIXED">Fixed</option><option value="QUOTED">Quoted</option><option value="ESTIMATED">Estimated</option><option value="VARIABLE">Variable</option></select>
          <select name="beneficiary" className="input">{Object.entries(BENEFICIARY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="payableStage" className="input"><option value="UPFRONT">Payable upfront</option><option value="ON_ARRIVAL">On arrival (if needed)</option></select>
          <input name="uncertaintyPercent" className="input" placeholder="Uncertainty ±%" defaultValue="0" />
          <input name="effectiveFrom" type="date" className="input" />
          <input name="conditions" className="input" placeholder='Conditions JSON e.g. {"sourceCountries":["US"]}' />
          <input name="sourceReference" className="input sm:col-span-3" placeholder="Source / citation (official publication, contract ref, date)" required />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="optional" /> Optional service</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="refundable" /> Refundable</label>
          <button className="btn-primary btn-sm w-fit">Save rule version</button>
        </form>
      </Card>
      <Card title="Exchange-rate snapshots">
        <form action={fxAction} className="mb-3 flex flex-wrap gap-2"><input name="base" className="input w-24" placeholder="USD" maxLength={3} required /><input name="rate" className="input w-40" placeholder="NGN per unit" required /><input name="source" className="input flex-1" placeholder="Rate source (authorised dealer / CBN reference) and time" required /><button className="btn-secondary btn-sm">Record snapshot</button></form>
        <ul className="text-sm">{fx.map((f) => <li key={f.id}>{f.base}/NGN {f.rate.toFixed(4)} · {f.source} · <LocalTime iso={f.capturedAt} /> {f.isDemo && <Badge tone="pending">demo</Badge>}</li>)}</ul>
      </Card>
    </div>
  );
}
