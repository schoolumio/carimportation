import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { CATEGORY_LABEL } from "@/server/disputes/service";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { DISPUTE_STATUS_LABEL } from "@/lib/labels";

export const metadata = { title: "Disputes" };

export default async function AdminDisputes() {
  await requirePerm("dispute.manage");
  const disputes = await prisma.dispute.findMany({ include: { order: true, raisedBy: true }, orderBy: [{ status: "asc" }, { responseDueAt: "asc" }] });
  return (
    <div>
      <PageHeader title="Disputes" />
      {!disputes.length ? <EmptyState title="No disputes" /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Ref</th><th>Order</th><th>Category</th><th>Raised by</th><th>Status</th><th>Response due</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{disputes.map((d) => (
            <tr key={d.id}><td><Link className="link" href={`/admin/disputes/${d.id}`}>{d.reference}</Link></td><td>{d.order.orderNumber}</td><td>{CATEGORY_LABEL[d.category]}</td><td className="text-xs">{d.raisedBy.email}</td><td><Badge tone={d.status === "DECISION_ISSUED" ? "verified" : d.responseDueAt < new Date() && d.status === "AWAITING_RESPONSE" ? "danger" : "pending"}>{DISPUTE_STATUS_LABEL[d.status]}</Badge></td><td><LocalTime iso={d.responseDueAt} /></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
