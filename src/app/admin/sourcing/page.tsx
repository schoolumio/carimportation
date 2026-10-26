import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { Badge, Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { platformOfferAction } from "../actions";

export const metadata = { title: "Sourcing" };

export default async function AdminSourcing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("sourcing.offer");
  const reqs = await prisma.sourcingRequest.findMany({ include: { offers: { include: { dealerOrg: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-4">
      <PageHeader title="Sourcing requests" />
      <Flash sp={sp} />
      {!reqs.length ? <EmptyState title="No sourcing requests" /> : reqs.map((r) => (
        <Card key={r.id} title={`${r.reference} · ${r.make} ${r.model} ${r.yearMin}–${r.yearMax}`} actions={<Badge>{r.status.toLowerCase().replace(/_/g, " ")}</Badge>}>
          <p className="text-sm text-slate-600">{r.contactName} ({r.contactEmail}) · budget {formatMoney(r.budgetMax, "NGN", { compact: true })} · <LocalTime iso={r.createdAt} /> {r.notes && `· ${r.notes}`}</p>
          <ul className="mt-2 text-sm">{r.offers.map((o) => <li key={o.id}>• {o.dealerOrg?.tradingName ?? "Platform"}: {o.vehicleDescription} — {formatMoney(o.vehiclePrice, o.vehicleCurrency)} ({o.status.toLowerCase()})</li>)}</ul>
          {["OPEN", "OFFERS_RECEIVED"].includes(r.status) && (
            <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-brand">Submit platform offer</summary>
              <form action={platformOfferAction} className="mt-2 grid gap-2 sm:grid-cols-3"><input type="hidden" name="requestId" value={r.id} />
                <input name="vehicleDescription" className="input sm:col-span-3" placeholder="Vehicle description" required /><input name="year" type="number" className="input" placeholder="Year" required /><input name="mileage" type="number" className="input" placeholder="Mileage" />
                <input name="sourceCountry" className="input" placeholder="Country (US)" required maxLength={2} /><input name="vehiclePrice" className="input" placeholder="Price" required />
                <select name="vehicleCurrency" className="input"><option>USD</option><option>EUR</option><option>CAD</option><option>AED</option></select>
                <input name="timelineNotes" className="input" placeholder="Timeline" required /><textarea name="conditionNotes" className="input sm:col-span-3" placeholder="Condition notes" />
                <button className="btn-primary btn-sm w-fit">Send offer</button>
              </form>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}
