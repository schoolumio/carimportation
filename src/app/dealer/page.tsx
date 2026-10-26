import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { dealerMetrics } from "@/server/dealers/service";
import { dealerAvailableBalance } from "@/server/settlement/payouts";
import { Card, Flash, Notice, PageHeader, Stat } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { StateBadge } from "@/components/OrderTimeline";

export const metadata = { title: "Dealer dashboard" };

export default async function DealerHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const orgId = actor.dealerOrgIds[0];
  const [org, m, bal, statusCounts, recentOrders, openInq, views] = await Promise.all([
    prisma.dealerOrganization.findUniqueOrThrow({ where: { id: orgId } }),
    dealerMetrics(orgId), dealerAvailableBalance(orgId),
    prisma.vehicleListing.groupBy({ by: ["status"], where: { dealerOrgId: orgId }, _count: { _all: true } }),
    prisma.order.findMany({ where: { dealerOrgId: orgId }, include: { quote: { include: { listing: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.inquiry.count({ where: { dealerOrgId: orgId, status: "OPEN" } }),
    prisma.vehicleListing.aggregate({ where: { dealerOrgId: orgId }, _sum: { viewCount: true } }),
  ]);
  const count = (s: string) => statusCounts.find((x) => x.status === s)?._count._all ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader title="Dealer dashboard" actions={org.status === "APPROVED" ? <Link className="btn-primary" href="/dealer/listings/new">New listing</Link> : undefined} />
      <Flash sp={sp} />
      {org.status !== "APPROVED" && <Notice tone="warning" title="Verification in progress">You can create listings once your organisation is approved. <Link className="link" href="/dealer/onboarding">Complete verification</Link>.</Notice>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Published listings" value={count("PUBLISHED")} hint={`${count("PENDING_REVIEW")} pending review · ${count("CHANGES_REQUESTED")} need changes`} />
        <Stat label="Open inquiries" value={openInq} tone={openInq ? "pending" : undefined} hint={`Response rate ${m.responseRate ?? "n/a"}${m.responseRate !== null ? "%" : ""}`} />
        <Stat label="Completed orders" value={m.completed} hint={`${m.disputes} disputes · ${m.upheldComplaints} upheld`} />
        <Stat label="Available to pay out" value={formatMoney(bal.available, "NGN", { compact: true })} hint={`${formatMoney(bal.pending, "NGN", { compact: true })} pending payout`} />
      </div>
      <Card title="Recent orders" actions={<Link className="link text-sm" href="/dealer/orders">All orders</Link>}>
        {recentOrders.length ? <ul className="divide-y divide-slate-100">{recentOrders.map((o) => <li key={o.id} className="flex justify-between py-2 text-sm"><Link className="link" href={`/dealer/orders/${o.id}`}>{o.orderNumber} · {o.quote.listing?.title}</Link><StateBadge state={o.state} /></li>)}</ul> : <p className="muted">No orders yet.</p>}
      </Card>
      <p className="text-xs text-slate-500">Listing views (all time): {views._sum.viewCount ?? 0}. Performance figures are calculated from platform records.</p>
    </div>
  );
}
