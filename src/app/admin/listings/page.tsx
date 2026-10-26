import Link from "next/link";
import type { ListingStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { AVAILABILITY_LABEL, LISTING_STATUS_LABEL } from "@/server/inventory/service";
import { Badge, EmptyState, Flash, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Listings" };

export default async function AdminListings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("listing.moderate");
  const status = (sp.status ?? "PENDING_REVIEW") as ListingStatus | "ALL";
  const listings = await prisma.vehicleListing.findMany({ where: status === "ALL" ? {} : { status }, include: { dealerOrg: true, flags: { where: { status: { in: ["OPEN", "INVESTIGATING"] } } } }, orderBy: { updatedAt: "desc" }, take: 200 });
  return (
    <div>
      <PageHeader title="Listings" actions={<Link href="/admin/listings/new" className="btn-primary">New platform listing</Link>} />
      <Flash sp={sp} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">{["PENDING_REVIEW", "PUBLISHED", "CHANGES_REQUESTED", "DRAFT", "SUSPENDED", "REJECTED", "EXPIRED", "SOLD", "ALL"].map((s) => <Link key={s} href={`/admin/listings?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-brand text-white" : "bg-white ring-1 ring-slate-200"}`}>{s === "ALL" ? "All" : LISTING_STATUS_LABEL[s as ListingStatus]}</Link>)}</nav>
      {!listings.length ? <EmptyState title="Nothing in this queue" /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Ref</th><th>Vehicle</th><th>Seller</th><th>Status</th><th>Availability</th><th className="text-right">Price</th><th>Flags</th><th>Updated</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{listings.map((l) => (
            <tr key={l.id}><td>{l.publicRef}</td><td><Link className="link" href={`/admin/listings/${l.id}`}>{l.title}</Link></td><td className="text-xs">{l.dealerOrg?.tradingName ?? "Platform"}</td><td><Badge>{LISTING_STATUS_LABEL[l.status]}</Badge></td><td className="text-xs">{AVAILABILITY_LABEL[l.availability]}</td><td className="text-right tabular-nums">{formatMoney(l.price, l.priceCurrency, { compact: true })}</td><td>{l.flags.length ? <Badge tone="danger">{l.flags.length}</Badge> : "—"}</td><td><LocalTime iso={l.updatedAt} /></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
