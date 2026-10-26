import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { DEALER_STATUS_LABEL } from "@/server/dealers/service";
import { Badge, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Dealers" };

export default async function AdminDealers() {
  await requirePerm("dealer.verify");
  const orgs = await prisma.dealerOrganization.findMany({ include: { checks: true, _count: { select: { listings: true, orders: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  return (
    <div>
      <PageHeader title="Dealers & verification" />
      <div className="card overflow-x-auto"><table className="table">
        <thead><tr><th>Dealer</th><th>Status</th><th>Checks passed</th><th>Listings</th><th>Orders</th><th>Applied</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{orgs.map((o) => (
          <tr key={o.id}><td><Link className="link" href={`/admin/dealers/${o.id}`}>{o.tradingName}</Link><br /><span className="text-xs text-slate-500">{o.legalName}</span></td><td><Badge tone={o.status === "APPROVED" ? "verified" : ["REJECTED", "SUSPENDED"].includes(o.status) ? "danger" : "pending"}>{DEALER_STATUS_LABEL[o.status]}</Badge></td><td>{o.checks.filter((c) => c.status === "PASSED").length}/{o.checks.length}</td><td>{o._count.listings}</td><td>{o._count.orders}</td><td><LocalTime iso={o.createdAt} mode="date" /></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
