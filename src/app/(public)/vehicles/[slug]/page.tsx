import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AlertTriangle, CalendarClock, Gavel, ShieldCheck } from "lucide-react";
import { displayVin, getPublicListing, AVAILABILITY_LABEL, LISTING_TYPE_LABEL } from "@/server/inventory/service";
import { estimateDelivery, estimateForVehicle, listingToCostInput, optionalServices } from "@/server/pricing/service";
import { isOrderable } from "@/server/quotes/service";
import { currentActor } from "@/server/web/session";
import { prisma } from "@/server/db";
import { VehicleImage } from "@/components/VehicleImage";
import { CostBreakdown } from "@/components/CostBreakdown";
import { Badge, Card, DemoTag, Flash, KeyValue, Notice } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { availabilityTone } from "@/components/VehicleCard";
import { breakdownFromResult } from "@/lib/serialize";
import { COUNTRY_NAME, PROVENANCE_LABEL } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { signDocumentLink } from "@/server/documents/service";
import { inquiryAction, reportAction, requestQuoteAction, toggleCompareAction, toggleSaveAction } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const l = await getPublicListing((await params).slug);
  return { title: l ? l.title : "Vehicle" };
}

const FACT_LABEL: Record<string, string> = { vin: "VIN / chassis", mileage: "Mileage", condition: "Condition", ownership: "Ownership / title" };

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const l = await getPublicListing(slug);
  if (!l) notFound();
  const actor = await currentActor();
  await prisma.vehicleListing.update({ where: { id: l.id }, data: { viewCount: { increment: 1 } } });
  const selected = ([] as string[]).concat(sp.optional ?? []);
  const options = await optionalServices();
  let estimateError: string | null = null;
  let breakdown = null;
  const eta = await estimateDelivery(l);
  try {
    const est = await estimateForVehicle(listingToCostInput(l), { selectedOptional: selected });
    breakdown = breakdownFromResult(est, { etaMinDays: eta.minDays, etaMaxDays: eta.maxDays });
  } catch (e) {
    estimateError = e instanceof Error ? e.message : "Estimate unavailable";
  }
  const saved = actor ? !!(await prisma.savedVehicle.findUnique({ where: { userId_listingId: { userId: actor.userId, listingId: l.id } } })) : false;
  const hasOrder = actor ? (await prisma.order.count({ where: { buyerId: actor.userId, listingId: l.id } })) > 0 : false;
  const compare = ((await cookies()).get("av_compare")?.value ?? "").split(",");
  const back = `/vehicles/${l.slug}`;
  const facts = new Map(l.facts.map((f) => [f.field, f]));
  const orderable = isOrderable(l);
  const optionalForListing = options.filter((o) => {
    const c = o.conditions;
    return !c.listingTypes?.length || c.listingTypes.includes(l.listingType);
  });

  return (
    <div className="container-page py-8">
      <Flash sp={sp} />
      <nav className="mb-3 text-xs text-slate-500"><Link href="/vehicles" className="hover:underline">Vehicles</Link> / {l.make} / {l.publicRef}</nav>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="aspect-[16/9]"><VehicleImage url={l.media[0]?.url} alt={l.title} /></div>
            {l.media.length > 1 && (
              <div className="grid grid-cols-4 gap-2 p-2">
                {l.media.slice(1, 9).map((m) => (
                  <div key={m.id} className="aspect-[4/3] overflow-hidden rounded">{m.kind === "VIDEO" ? <video src={m.url} controls className="h-full w-full object-cover" /> : <VehicleImage url={m.url} alt={m.caption ?? l.title} showLabel={false} />}</div>
                ))}
              </div>
            )}
          </div>

          <Card title="Facts & verification">
            <p className="mb-3 text-xs text-slate-500">We distinguish facts substantiated by evidence from information declared by the seller. We never mark a fact as verified without a supporting document.</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(FACT_LABEL).map(([k, label]) => {
                const f = facts.get(k);
                const p = PROVENANCE_LABEL[f?.provenance ?? "DEALER_DECLARED"];
                const value = k === "vin" ? displayVin(l, hasOrder) ?? "Not provided" : k === "mileage" ? `${l.mileage.toLocaleString()} ${l.mileageUnit}` : k === "condition" ? l.conditionGrade ?? "See summary" : l.ownershipInfo ?? "Not provided";
                return (
                  <li key={k} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><Badge tone={p.tone}>{p.tone === "verified" && <ShieldCheck className="h-3 w-3" aria-hidden />} {p.label}</Badge></div>
                    <p className="mt-1 text-sm font-medium">{value}</p>
                    {f?.verifiedAt && f.provenance !== "DEALER_DECLARED" && <p className="text-xs text-slate-500">Checked <LocalTime iso={f.verifiedAt} mode="date" />{f.documentId && <> · <a className="link" href={signDocumentLink(f.documentId, actor?.userId ?? null)}>evidence</a></>}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Condition & disclosures">
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold">Condition summary (seller):</span> {l.conditionSummary}</p>
              {l.damageDisclosure && <p><span className="font-semibold">Damage disclosure:</span> {l.damageDisclosure}</p>}
              {l.knownDefects && <p><span className="font-semibold">Known defects:</span> {l.knownDefects}</p>}
              {l.requiredRepairs && <p><span className="font-semibold">Required repairs:</span> {l.requiredRepairs}</p>}
              {l.previousUse && <p><span className="font-semibold">Previous use:</span> {l.previousUse}</p>}
              {l.history.length > 0 && (
                <div>
                  <p className="font-semibold">History disclosures</p>
                  <ul className="mt-1 space-y-1">{l.history.map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2"><Badge tone={PROVENANCE_LABEL[h.provenance].tone}>{PROVENANCE_LABEL[h.provenance].label}</Badge> {h.description}</li>)}</ul>
                </div>
              )}
            </div>
          </Card>

          <Card title="Inspection reports">
            {l.inspections.length ? (
              <ul className="space-y-3">
                {l.inspections.map((i) => (
                  <li key={i.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{i.inspectorName}</span>
                      <Badge tone={i.inspectorType === "INDEPENDENT" ? "verified" : "neutral"}>{i.inspectorType === "INDEPENDENT" ? "Independent inspector" : i.inspectorType === "DEALER" ? "Seller's own inspection" : i.inspectorType.toLowerCase()}</Badge>
                      {i.platformReviewed && <Badge tone="verified">Reviewed by platform</Badge>}
                      {i.isDemo && <DemoTag />}
                    </div>
                    <p className="mt-1 text-slate-600">{i.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">Grade {i.grade ?? "n/a"} · inspected <LocalTime iso={i.inspectedAt} mode="date" /> {i.reportDocumentId && <>· <a className="link" href={signDocumentLink(i.reportDocumentId, actor?.userId ?? null)}>Download report</a></>}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Notice tone="warning">No inspection report yet. You can add an independent pre-shipment inspection as an optional service in the cost estimate.</Notice>
            )}
          </Card>

          <Card title="Specifications">
            <KeyValue items={[
              ["Make / model", `${l.make} ${l.model}`], ["Year", l.year], ["Trim", l.trim], ["Body style", l.bodyStyle],
              ["Engine", l.spec?.engineCapacityCc ? `${(l.spec.engineCapacityCc / 1000).toFixed(1)} L` : null], ["Fuel", l.spec?.fuelType], ["Transmission", l.spec?.transmission],
              ["Drivetrain", l.spec?.drivetrain], ["Steering", l.spec?.steering === "LHD" ? "Left-hand drive" : "Right-hand drive"], ["Exterior / interior", `${l.spec?.exteriorColor ?? "—"} / ${l.spec?.interiorColor ?? "—"}`],
              ["Mileage", `${l.mileage.toLocaleString()} ${l.mileageUnit}`], ["Source", l.supplier?.name ?? l.sourceName ?? (l.dealerOrg ? "Dealer stock" : "Platform sourcing")],
              ["Source country", COUNTRY_NAME[l.sourceCountry] ?? l.sourceCountry], ["Current location", l.currentLocation], ["Origin port", l.originPort],
              ["Listing type", LISTING_TYPE_LABEL[l.listingType]], ["Listed", l.publishedAt ? <LocalTime key="p" iso={l.publishedAt} mode="date" /> : null], ["Listing expires", l.expiresAt ? <LocalTime key="e" iso={l.expiresAt} mode="date" /> : null],
            ]} />
          </Card>

          <Card title="Terms for this vehicle">
            <div className="space-y-2 text-sm text-slate-700">
              <p><span className="font-semibold">Cancellation:</span> {l.cancellationTerms ?? "Before payment you may cancel without charge. After payment, cancellation is subject to costs already irreversibly incurred — see the cancellation & refund policy."}</p>
              <p><span className="font-semibold">Warranty:</span> {l.warrantyText ?? "No warranty unless stated."}</p>
              {l.disclaimer && <p className="text-xs text-slate-500">{l.disclaimer}</p>}
              <p><Link href="/legal/refunds-disputes" className="link">Cancellation, refund & dispute policy</Link></p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="card card-pad lg:sticky lg:top-20">
            <div className="flex flex-wrap gap-1">
              <Badge tone={availabilityTone(l.availability)}>{AVAILABILITY_LABEL[l.availability]}</Badge>
              {l.isDemo && <DemoTag />}
            </div>
            <h1 className="mt-2 text-2xl font-bold">{l.title}</h1>
            <p className="text-sm text-slate-500">{l.publicRef} · {l.dealerOrg ? <Link className="link" href={`/dealers/${l.dealerOrg.slug}`}>{l.dealerOrg.tradingName}</Link> : "Platform inventory"} {l.dealerOrg?.status === "APPROVED" && <Badge tone="verified">Verified business</Badge>}</p>
            <p className="mt-4 text-xs text-slate-500">Vehicle price</p>
            <p className="text-3xl font-bold">{formatMoney(l.price, l.priceCurrency, { compact: true })}</p>
            {breakdown && <p className="mt-1 text-sm text-slate-600">Estimated landed in Lagos: <span className="font-semibold text-slate-900">{formatMoney(breakdown.total, "NGN", { compact: true })}</span></p>}
            <p className="mt-2 flex items-center gap-1 text-sm text-slate-600"><CalendarClock className="h-4 w-4" aria-hidden /> Estimated {eta.minDays}–{eta.maxDays} days to delivery in Lagos</p>
            {l.listingType === "OVERSEAS_AUCTION" && (
              <div className="mt-4"><Notice tone="warning" title="Auction vehicle"><Gavel className="mb-1 inline h-4 w-4" aria-hidden /> {l.biddingNotes} {l.auctionDate && <>Auction date: <LocalTime iso={l.auctionDate} mode="date" />. </>}{l.storageDeadline && <>Storage deadline: <LocalTime iso={l.storageDeadline} mode="date" />.</>}</Notice></div>
            )}
            <form action={requestQuoteAction} className="mt-4 space-y-2">
              <input type="hidden" name="listingId" value={l.id} />
              <input type="hidden" name="back" value={back} />
              {selected.map((s) => <input key={s} type="hidden" name="optional" value={s} />)}
              <button className="btn-primary w-full" disabled={!orderable}>{orderable ? "Get my quote & reserve" : "Not available to order"}</button>
              <p className="text-center text-xs text-slate-500">A quote is free and holds today&apos;s estimate until it expires. Nothing is charged until you accept the terms and pay.</p>
            </form>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <form action={toggleSaveAction}><input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="back" value={back} /><button className="btn-secondary w-full btn-sm">{saved ? "Saved ✓" : "Save"}</button></form>
              <form action={toggleCompareAction}><input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="back" value={back} /><button className="btn-secondary w-full btn-sm">{compare.includes(l.id) ? "In comparison ✓" : "Compare"}</button></form>
            </div>
            {compare.filter(Boolean).length > 1 && <Link href="/compare" className="mt-2 block text-center text-xs text-brand hover:underline">View comparison ({compare.filter(Boolean).length})</Link>}
          </div>

          <div id="landed-cost" className="card card-pad scroll-mt-20">
            <h2 className="h2">Estimated cost to Lagos</h2>
            {optionalForListing.length > 0 && (
              <form className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold">Optional services</p>
                {optionalForListing.map((o) => (
                  <label key={o.code} className="flex items-center gap-2"><input type="checkbox" name="optional" value={o.code} defaultChecked={selected.includes(o.code)} /> {o.label}</label>
                ))}
                <button className="btn-secondary btn-sm mt-1">Update estimate</button>
              </form>
            )}
            <div className="mt-4">
              {breakdown ? <CostBreakdown data={breakdown} /> : <Notice tone="danger" title="Estimate unavailable">{estimateError} — our team has been notified. You can still request a quote.</Notice>}
            </div>
          </div>

          <Card title="Delivery estimate">
            <ul className="space-y-1 text-sm">{eta.stages.map((s) => <li key={s.key} className="flex justify-between"><span>{s.label}</span><span className="text-slate-600">{s.min}–{s.max} days</span></li>)}</ul>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">{eta.basis.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </Card>

          <Card title="Ask the seller">
            <form action={inquiryAction} className="space-y-2">
              <input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="back" value={back} />
              <textarea name="message" required minLength={5} className="input min-h-[80px]" placeholder="Ask about service history, photos of a specific area, etc." />
              <button className="btn-secondary btn-sm">{actor ? "Send question" : "Sign in to ask"}</button>
            </form>
          </Card>

          <details className="card card-pad text-sm">
            <summary className="cursor-pointer font-semibold"><AlertTriangle className="mr-1 inline h-4 w-4 text-pending" aria-hidden /> Report this listing</summary>
            <form action={reportAction} className="mt-3 space-y-2">
              <input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="back" value={back} />
              <textarea name="details" required minLength={10} className="input" placeholder="What looks wrong? (e.g. VIN mismatch, suspected stolen photos)" />
              <button className="btn-secondary btn-sm">Submit report</button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
