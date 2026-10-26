import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/web/session";
import { getQuoteForViewer } from "@/server/quotes/service";
import { prisma } from "@/server/db";
import { getConfig } from "@/server/admin/config";
import { CostBreakdown } from "@/components/CostBreakdown";
import { Card, Flash, Notice, PageHeader } from "@/components/ui";
import { VehicleImage } from "@/components/VehicleImage";
import { breakdownFromQuote } from "@/lib/serialize";
import { buildSettlementPlan, MILESTONE_LABEL } from "@/server/settlement/settlement";
import { pathForListing, PATH_LABEL } from "@/server/orders/state-machine";
import { formatMoney } from "@/lib/money";
import { BENEFICIARY_LABEL } from "@/lib/labels";
import { acceptQuoteAction } from "./actions";

export const metadata = { title: "Review & accept" };

export default async function Checkout({ params, searchParams }: { params: Promise<{ quoteId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { quoteId } = await params;
  const sp = await searchParams;
  const actor = await requireActor(`/checkout/${quoteId}`);
  let q;
  try { q = await getQuoteForViewer(actor, quoteId); } catch { notFound(); }
  if (q.order) redirect(`/account/orders/${q.order.id}`);
  const expired = q.status !== "ISSUED" || q.validUntil <= new Date();
  const locations = await prisma.deliveryLocation.findMany({ where: { active: true } });
  const profile = await prisma.buyerProfile.findUnique({ where: { userId: actor.userId } });
  const inspectionHours = await getConfig("orders.inspectionPeriodHours");
  const releasePct = await getConfig("settlement.vehicleReleaseOnPurchasePercent");
  const path = pathForListing(q.listing?.listingType ?? "OVERSEAS_SUPPLIER_STOCK", q.listing?.availability ?? "AVAILABLE_FOR_PURCHASE", !!q.sourcingOffer);
  const plan = buildSettlementPlan({ path, lines: q.lineItems.map((l) => ({ category: l.category, amount: l.amount, beneficiary: l.beneficiary, payableStage: l.payableStage })), dealerOrgId: q.listing?.dealerOrgId ?? null, vehicleReleaseOnPurchasePercent: releasePct });
  const title = q.listing?.title ?? q.sourcingOffer?.vehicleDescription ?? "Vehicle";
  return (
    <div className="container-page py-8">
      <PageHeader title="Review your quote and terms" subtitle={`Quote ${q.quoteNumber} · ${title}`} />
      <Flash sp={sp} />
      {expired && <div className="mb-4"><Notice tone="warning" title="This quote has expired">Prices and exchange rates must be recalculated. {q.listing && <Link className="link" href={`/vehicles/${q.listing.slug}`}>Get a new quote</Link>}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Itemised cost">
          <CostBreakdown data={breakdownFromQuote(q)} />
        </Card>
        <div className="space-y-6">
          {q.listing && (
            <div className="card overflow-hidden">
              <div className="aspect-[16/9]"><VehicleImage url={q.listing.media[0]?.url} alt={title} /></div>
              <div className="p-4"><p className="font-semibold">{title}</p><p className="text-xs text-slate-500">{PATH_LABEL[path]} · {q.listing.dealerOrg ? q.listing.dealerOrg.tradingName : "Platform inventory"}</p></div>
            </div>
          )}
          <Card title="How your payment will be released">
            <ul className="space-y-2 text-sm">
              {plan.map((p, i) => <li key={i} className="flex justify-between gap-3"><span><span className="font-medium">{MILESTONE_LABEL[p.milestone]}</span><br /><span className="text-xs text-slate-500">{p.description} → {BENEFICIARY_LABEL[p.beneficiary] ?? p.beneficiary}</span></span><span className="shrink-0 tabular-nums">{formatMoney(p.amount, "NGN", { compact: true })}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Releases happen only after verified milestones and two finance approvals, and are frozen while a dispute is open. Contingency is not collected now.</p>
          </Card>
          <form action={acceptQuoteAction} className="card card-pad space-y-3">
            <input type="hidden" name="quoteId" value={q.id} />
            <h2 className="h2">Delivery in Lagos</h2>
            <label className="block"><span className="label">Area</span><select name="location" className="input">{locations.map((l) => <option key={l.code} value={l.name}>{l.name}</option>)}</select></label>
            <label className="block"><span className="label">Delivery address</span><input name="address" className="input" required defaultValue={profile?.addressLine ?? ""} /></label>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
              <p>• The amount payable now is <strong>{formatMoney(q.payableNow)}</strong>. Remaining estimated costs are only charged if needed and with your approval.</p>
              <p>• Inspection & acceptance period after delivery: <strong>{inspectionHours} hours</strong>.</p>
              <p>• {q.type === "FIXED_PRICE" ? "This is a fixed-price quote for the included items." : "This is an estimate, not a guaranteed total."} Delivery timing ({q.etaMinDays}–{q.etaMaxDays} days) is an estimate.</p>
              <p>• Cancellation: {q.listing?.cancellationTerms ?? "free before payment; after payment, subject to costs irreversibly incurred."}</p>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="accept" required className="mt-1" /><span>I have reviewed the itemised quote, exclusions, assumptions, settlement schedule and the <Link className="link" href="/legal/terms" target="_blank">terms</Link> and <Link className="link" href="/legal/refunds-disputes" target="_blank">refund & dispute policy</Link>, and I accept them.</span></label>
            <button className="btn-primary w-full" disabled={expired}>Accept & create order</button>
            {profile?.identityStatus !== "VERIFIED" && <p className="text-xs text-amber-700">You&apos;ll need to verify your identity before payment instructions are issued.</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
