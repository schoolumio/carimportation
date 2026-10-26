import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { Badge, Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { COUNTRY_NAME } from "@/lib/labels";
import { acceptOfferAction, cancelSourcingAction, declineOfferAction } from "../actions";

export const metadata = { title: "Sourcing requests" };

export default async function Sourcing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const reqs = await prisma.sourcingRequest.findMany({ where: { OR: [{ userId: actor.userId }, { contactEmail: actor.email }] }, include: { offers: { include: { dealerOrg: true }, orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Sourcing requests" actions={<Link href="/request-a-car" className="btn-primary">New request</Link>} />
      <Flash sp={sp} />
      {!reqs.length ? <EmptyState title="No sourcing requests" action={<Link className="btn-primary" href="/request-a-car">Request a car</Link>} /> : (
        <div className="space-y-4">{reqs.map((r) => (
          <Card key={r.id} title={<span>{r.make} {r.model} {r.yearMin}–{r.yearMax} <span className="text-xs font-normal text-slate-500">· {r.reference}</span></span>} actions={<Badge>{r.status.replace(/_/g, " ").toLowerCase()}</Badge>}>
            <p className="text-sm text-slate-600">Budget up to {formatMoney(r.budgetMax, "NGN", { compact: true })} delivered · preferred: {r.preferredCountries.map((c) => COUNTRY_NAME[c] ?? c).join(", ") || "any"}</p>
            {r.offers.length ? (
              <ul className="mt-3 space-y-3">{r.offers.map((o) => (
                <li key={o.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{o.vehicleDescription}</span><Badge tone={o.status === "SUBMITTED" ? "pending" : o.status === "ACCEPTED" ? "verified" : "neutral"}>{o.status.toLowerCase()}</Badge></div>
                  <p className="text-slate-600">{formatMoney(o.vehiclePrice, o.vehicleCurrency)} · from {COUNTRY_NAME[o.sourceCountry] ?? o.sourceCountry} · {o.mileage?.toLocaleString() ?? "?"} km/mi · by {o.dealerOrg?.tradingName ?? "Platform sourcing team"}</p>
                  <p className="text-xs text-slate-500">{o.timelineNotes} {o.conditionNotes && `· ${o.conditionNotes}`} · valid until <LocalTime iso={o.validUntil} /></p>
                  {o.status === "SUBMITTED" && o.validUntil > new Date() && (
                    <div className="mt-2 flex gap-2">
                      <form action={acceptOfferAction}><input type="hidden" name="offerId" value={o.id} /><button className="btn-primary btn-sm">Get sourcing quote</button></form>
                      <form action={declineOfferAction}><input type="hidden" name="offerId" value={o.id} /><button className="btn-secondary btn-sm">Decline</button></form>
                    </div>
                  )}
                </li>
              ))}</ul>
            ) : <p className="muted mt-2">No offers yet. Verified dealers and our sourcing team are reviewing your request.</p>}
            {["OPEN", "OFFERS_RECEIVED"].includes(r.status) && r.userId === actor.userId && <form action={cancelSourcingAction} className="mt-3"><input type="hidden" name="requestId" value={r.id} /><button className="btn-ghost btn-sm">Cancel request</button></form>}
          </Card>
        ))}</div>
      )}
    </div>
  );
}
