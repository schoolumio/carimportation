import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { QUOTE_TYPE_LABEL } from "@/lib/labels";

export const metadata = { title: "My quotes" };

export default async function Quotes() {
  const actor = await requireActor();
  const quotes = await prisma.quote.findMany({ where: { buyerId: actor.userId }, include: { listing: true, sourcingOffer: true, order: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title="Quotes" subtitle="Quotes hold an estimate until they expire. Accept one to create an order." />
      {!quotes.length ? <EmptyState title="No quotes yet" action={<Link className="btn-primary" href="/vehicles">Browse vehicles</Link>} /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Quote</th><th>Vehicle</th><th>Type</th><th className="text-right">Estimated total</th><th>Status</th><th>Expires</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">{quotes.map((q) => {
            const expired = q.status === "EXPIRED" || (q.status === "ISSUED" && q.validUntil < new Date());
            return (
              <tr key={q.id}>
                <td>{q.quoteNumber}</td><td>{q.listing?.title ?? q.sourcingOffer?.vehicleDescription}</td><td className="text-xs">{QUOTE_TYPE_LABEL[q.type].label}</td>
                <td className="text-right tabular-nums">{formatMoney(q.totalEstimate, "NGN", { compact: true })}</td>
                <td><Badge tone={q.order ? "verified" : expired ? "neutral" : "pending"}>{q.order ? "Ordered" : expired ? "Expired" : "Open"}</Badge></td>
                <td><LocalTime iso={q.validUntil} /></td>
                <td>{q.order ? <Link className="link" href={`/account/orders/${q.order.id}`}>Order</Link> : !expired && <Link className="link" href={`/checkout/${q.id}`}>Review</Link>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>
  );
}
