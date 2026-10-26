import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { CATEGORY_LABEL } from "@/server/disputes/service";
import { DISPUTE_STATUS_LABEL } from "@/lib/labels";

export const metadata = { title: "Dispute centre" };

export default async function Disputes() {
  const actor = await requireActor();
  const disputes = await prisma.dispute.findMany({ where: { raisedById: actor.userId }, include: { order: true }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Dispute centre" subtitle="Open a dispute from the order page. Each dispute has a response deadline and ends with a documented decision." />
      {!disputes.length ? <EmptyState title="No disputes">We hope it stays that way. If something goes wrong, open the order and choose “Report a problem”.</EmptyState> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Reference</th><th>Order</th><th>Category</th><th>Status</th><th>Response due</th><th>Outcome</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{disputes.map((d) => (
            <tr key={d.id}><td>{d.reference}</td><td><Link className="link" href={`/account/orders/${d.orderId}`}>{d.order.orderNumber}</Link></td><td>{CATEGORY_LABEL[d.category]}</td><td><Badge tone={d.status === "DECISION_ISSUED" ? "verified" : "pending"}>{DISPUTE_STATUS_LABEL[d.status]}</Badge></td><td><LocalTime iso={d.responseDueAt} /></td><td>{d.outcome?.replace(/_/g, " ").toLowerCase() ?? "—"}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
