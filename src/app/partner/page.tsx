import Link from "next/link";
import { requireAnyRole } from "@/server/web/session";
import { shipmentsForPartner } from "@/server/logistics/service";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { StateBadge } from "@/components/OrderTimeline";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Partner console" };

export default async function PartnerHome() {
  const actor = await requireAnyRole(["LOGISTICS_OPERATOR", "CLEARING_PARTNER", "DELIVERY_PARTNER", "OPERATIONS", "SUPER_ADMIN"]);
  const shipments = await shipmentsForPartner(actor);
  return (
    <div className="container-page py-8">
      <PageHeader title="Assigned shipments" subtitle="You can only see and update shipments assigned to you. Every update is timestamped and audited." />
      {!shipments.length ? <EmptyState title="No shipments assigned">Operations will assign shipments to you.</EmptyState> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Shipment</th><th>Vehicle</th><th>Your role</th><th>Order status</th><th>Vessel</th><th>Current ETA</th><th>Last update</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{shipments.map((s) => (
            <tr key={s.id}>
              <td><Link className="link" href={`/partner/shipments/${s.id}`}>{s.reference}</Link> {s.isDemo && <Badge tone="pending">DEMO</Badge>}</td>
              <td>{s.order.listing?.title ?? s.order.orderNumber}</td>
              <td className="text-xs">{s.assignments.filter((a) => a.userId === actor.userId).map((a) => a.role.replace(/_/g, " ").toLowerCase()).join(", ") || "operations"}</td>
              <td><StateBadge state={s.order.state} /></td><td>{s.vesselName ?? "—"}</td>
              <td>{s.currentEtaStart ? <LocalTime iso={s.currentEtaStart} mode="date" /> : "—"}</td><td>{s.lastUpdateAt ? <LocalTime iso={s.lastUpdateAt} /> : "—"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
