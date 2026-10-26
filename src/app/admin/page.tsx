import Link from "next/link";
import { requireStaff } from "@/server/web/session";
import { adminOverview, shipmentPerformance } from "@/server/reporting/service";
import { Card, PageHeader, Stat } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { StateBadge } from "@/components/OrderTimeline";
import { formatMoney } from "@/lib/money";
import { STATE_LABEL } from "@/server/orders/state-machine";

export const metadata = { title: "Operations overview" };

export default async function AdminHome() {
  await requireStaff();
  const o = await adminOverview();
  const perf = await shipmentPerformance();
  const queue: [string, number, string][] = [
    ["Listings awaiting moderation", o.listingsPending, "/admin/listings?status=PENDING_REVIEW"],
    ["Dealer applications pending", o.pendingDealers, "/admin/dealers"],
    ["Identity reviews pending", o.pendingIdentity, "/admin/compliance"],
    ["Compliance checks outstanding", o.complianceOpen, "/admin/compliance"],
    ["Manual payments awaiting 2nd approval", o.pendingManual, "/admin/finance"],
    ["Settlements awaiting 2nd approval", o.approvalSettlements, "/admin/finance"],
    ["Refund requests", o.refundRequests, "/admin/finance"],
    ["Open disputes", o.openDisputes, "/admin/disputes"],
    ["Additional cost approvals", o.costApprovals, "/admin/costs"],
    ["Documents awaiting review", o.missingDocs, "/admin/orders"],
    ["Trust & safety flags", o.openFlags, "/admin/flags"],
    ["Orders awaiting buyer payment", o.awaitingPayment, "/admin/orders?state=AWAITING_PAYMENT"],
  ];
  const max = Math.max(1, ...o.stateCounts.map((s) => s.count));
  return (
    <div className="space-y-6">
      <PageHeader title="Operations overview" subtitle="Live figures from platform records." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Published listings" value={o.listingsPublished} />
        <Stat label="Active orders" value={o.activeOrders} hint={`Value ${formatMoney(o.orderValue, "NGN", { compact: true })}`} />
        <Stat label="Platform revenue recognised" value={formatMoney(o.revenue, "NGN", { compact: true })} hint="Released platform fees & commissions (ledger)" />
        <Stat label="Funds eligible for settlement" value={formatMoney(o.eligibleSettlementsAmount, "NGN", { compact: true })} hint={`${o.eligibleSettlementsCount} instructions · ${o.unreconciled} unreconciled provider txns`} tone={o.unreconciled ? "pending" : undefined} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Work queues">
          <ul className="divide-y divide-slate-100">{queue.map(([l, n, h]) => <li key={l} className="flex items-center justify-between py-2 text-sm"><Link href={h} className="hover:underline">{l}</Link><span className={`rounded-full px-2 text-xs font-bold ${n ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-500"}`}>{n}</span></li>)}</ul>
        </Card>
        <Card title="Orders by status">
          {o.stateCounts.length ? <ul className="space-y-1.5">{o.stateCounts.sort((a, b) => b.count - a.count).map((s) => (
            <li key={s.state} className="grid grid-cols-[150px_1fr_30px] items-center gap-2 text-xs"><span>{STATE_LABEL[s.state]}</span><span className="h-2 rounded bg-brand" style={{ width: `${(s.count / max) * 100}%` }} /><span className="text-right">{s.count}</span></li>
          ))}</ul> : <p className="muted">No orders yet.</p>}
        </Card>
        <Card title="Upcoming vessel arrivals (21 days)">
          {o.upcomingArrivals.length ? <ul className="divide-y divide-slate-100 text-sm">{o.upcomingArrivals.map((s) => <li key={s.id} className="flex justify-between py-2"><Link className="link" href={`/admin/orders/${s.orderId}`}>{s.order.orderNumber} · {s.vesselName ?? "vessel TBC"}</Link><span><LocalTime iso={s.currentEtaStart} mode="date" /></span></li>)}</ul> : <p className="muted">No arrivals expected in the next 21 days.</p>}
        </Card>
        <Card title="Orders at risk of delay (no update within SLA)">
          {o.staleOrders.length ? <ul className="divide-y divide-slate-100 text-sm">{o.staleOrders.map((x) => <li key={x.id} className="flex justify-between py-2"><Link className="link" href={`/admin/orders/${x.id}`}>{x.orderNumber}</Link><span className="flex items-center gap-2"><StateBadge state={x.state} /> last change <LocalTime iso={x.updatedAt} mode="date" /></span></li>)}</ul> : <p className="muted">All active orders updated within the SLA.</p>}
        </Card>
        <Card title="Shipment performance">
          {perf ? <p className="text-sm">{perf.onTimePercent}% of {perf.measured} arrived shipments arrived within their original estimate.</p> : <p className="muted">Not enough completed shipments to measure yet.</p>}
        </Card>
      </div>
    </div>
  );
}
