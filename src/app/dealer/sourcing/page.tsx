import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { COUNTRY_NAME } from "@/lib/labels";
import { offerAction } from "../actions";

export const metadata = { title: "Sourcing requests" };

export default async function DealerSourcing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const reqs = await prisma.sourcingRequest.findMany({ where: { status: { in: ["OPEN", "OFFERS_RECEIVED"] } }, include: { offers: { where: { dealerOrgId: actor.dealerOrgIds[0] } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div className="space-y-4">
      <PageHeader title="Open sourcing requests" subtitle="Buyer identities are not shared until an offer is accepted and an order is placed." />
      <Flash sp={sp} />
      {!reqs.length ? <EmptyState title="No open requests" /> : reqs.map((r) => (
        <Card key={r.id} title={`${r.make} ${r.model} ${r.yearMin}–${r.yearMax}`}>
          <p className="text-sm text-slate-600">Budget up to {formatMoney(r.budgetMax, "NGN", { compact: true })} delivered · max mileage {r.maxMileage?.toLocaleString() ?? "any"} · {r.fuelType ?? "any fuel"} · {r.transmission ?? "any transmission"} · preferred {r.preferredCountries.map((c) => COUNTRY_NAME[c] ?? c).join(", ") || "any country"} · <LocalTime iso={r.createdAt} mode="date" /></p>
          {r.notes && <p className="text-sm">“{r.notes}”</p>}
          {r.offers.length ? <p className="mt-2 text-sm text-verified">You have submitted {r.offers.length} offer(s).</p> : (
            <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-brand">Submit an offer</summary>
              <form action={offerAction} className="mt-2 grid gap-2 sm:grid-cols-3">
                <input type="hidden" name="requestId" value={r.id} />
                <input name="vehicleDescription" className="input sm:col-span-3" placeholder="Exact vehicle: year, make, model, trim, key facts" required />
                <input name="year" type="number" className="input" placeholder="Year" required />
                <input name="mileage" type="number" className="input" placeholder="Mileage" />
                <input name="sourceCountry" className="input" placeholder="Country code (US)" maxLength={2} required />
                <input name="vehiclePrice" className="input" placeholder="Vehicle price" required />
                <select name="vehicleCurrency" className="input"><option>USD</option><option>EUR</option><option>CAD</option><option>AED</option><option>NGN</option></select>
                <input name="engineCapacityCc" type="number" className="input" placeholder="Engine cc" />
                <input name="timelineNotes" className="input sm:col-span-2" placeholder="Estimated purchase & shipping timeline" required />
                <input name="validDays" type="number" className="input" defaultValue={7} />
                <textarea name="conditionNotes" className="input sm:col-span-3" placeholder="Condition notes" />
                <div><button className="btn-primary btn-sm">Send offer</button></div>
              </form>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}
