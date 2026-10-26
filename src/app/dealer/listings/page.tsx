import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { AVAILABILITY_LABEL, LISTING_STATUS_LABEL } from "@/server/inventory/service";
import { Badge, EmptyState, Flash, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Inventory" };

export default async function DealerListings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const listings = await prisma.vehicleListing.findMany({ where: { dealerOrgId: actor.dealerOrgIds[0] }, include: { _count: { select: { inquiries: true, savedBy: true, orders: true } } }, orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader title="Inventory" actions={<Link className="btn-primary" href="/dealer/listings/new">New listing</Link>} />
      <Flash sp={sp} />
      {!listings.length ? <EmptyState title="No listings yet" action={<Link className="btn-primary" href="/dealer/listings/new">Create your first listing</Link>} /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Ref</th><th>Vehicle</th><th>Status</th><th>Availability</th><th className="text-right">Price</th><th>Views</th><th>Saves</th><th>Inquiries</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{listings.map((l) => (
            <tr key={l.id}><td>{l.publicRef}</td><td><Link className="link" href={`/dealer/listings/${l.id}`}>{l.title}</Link></td><td><Badge tone={l.status === "PUBLISHED" ? "verified" : ["REJECTED", "SUSPENDED"].includes(l.status) ? "danger" : "pending"}>{LISTING_STATUS_LABEL[l.status]}</Badge></td><td className="text-xs">{AVAILABILITY_LABEL[l.availability]}</td><td className="text-right tabular-nums">{formatMoney(l.price, l.priceCurrency, { compact: true })}</td><td>{l.viewCount}</td><td>{l._count.savedBy}</td><td>{l._count.inquiries}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
