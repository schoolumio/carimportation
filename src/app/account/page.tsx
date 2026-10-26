import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { Card, EmptyState, Flash, Notice, PageHeader, Stat } from "@/components/ui";
import { StateBadge } from "@/components/OrderTimeline";
import { formatMoney } from "@/lib/money";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "My account" };

export default async function AccountHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const [orders, profile, costs, saved, openDisputes, docRequests] = await Promise.all([
    prisma.order.findMany({ where: { buyerId: actor.userId }, include: { quote: { include: { listing: true, sourcingOffer: true } }, paymentIntents: true }, orderBy: { createdAt: "desc" } }),
    prisma.buyerProfile.findUnique({ where: { userId: actor.userId } }),
    prisma.costAdjustment.findMany({ where: { order: { buyerId: actor.userId }, status: "AWAITING_BUYER_APPROVAL" }, include: { order: true } }),
    prisma.savedVehicle.count({ where: { userId: actor.userId } }),
    prisma.dispute.count({ where: { raisedById: actor.userId, status: { in: ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"] } } }),
    prisma.supportConversation.count({ where: { createdById: actor.userId, status: "PENDING_CUSTOMER" } }),
  ]);
  const active = orders.filter((o) => !["COMPLETED", "REFUNDED", "CANCELLED"].includes(o.state));
  const actions: { href: string; text: string; tone: "warning" | "info" }[] = [];
  for (const o of orders) {
    if (o.state === "COMPLIANCE_CHECK" && profile?.identityStatus !== "PENDING") actions.push({ href: "/account/profile#identity", text: `Verify your identity to receive payment instructions for ${o.orderNumber}.`, tone: "warning" });
    if (o.state === "COMPLIANCE_CHECK" && profile?.identityStatus === "PENDING") actions.push({ href: `/account/orders/${o.id}`, text: `Your identity is under review for ${o.orderNumber}.`, tone: "info" });
    if (o.state === "AWAITING_PAYMENT") actions.push({ href: `/account/orders/${o.id}`, text: `Pay ${formatMoney(o.payableNow)} for ${o.orderNumber} using your unique reference.`, tone: "warning" });
    if (o.state === "ACCEPTANCE_PERIOD") actions.push({ href: `/account/orders/${o.id}`, text: `Inspect and accept ${o.orderNumber} or report a problem before your inspection period ends.`, tone: "warning" });
  }
  for (const c of costs) actions.push({ href: `/account/orders/${c.orderId}`, text: `Review an additional charge on ${c.order.orderNumber}: ${c.label} (${formatMoney(c.amount)}).`, tone: "warning" });
  if (docRequests) actions.push({ href: "/account/support", text: `Support is waiting for your reply on ${docRequests} conversation(s).`, tone: "info" });
  return (
    <div>
      <PageHeader title={`Welcome, ${actor.fullName.split(" ")[0]}`} subtitle="Your orders, required actions and documents in one place." actions={<Link href="/vehicles" className="btn-primary">Browse vehicles</Link>} />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Active orders" value={active.length} />
        <Stat label="Completed" value={orders.filter((o) => o.state === "COMPLETED").length} />
        <Stat label="Saved vehicles" value={saved} />
        <Stat label="Open disputes" value={openDisputes} tone={openDisputes ? "pending" : undefined} />
      </div>
      <Card title="Required actions" className="mb-6">
        {actions.length ? <ul className="space-y-2">{actions.map((a, i) => <li key={i}><Link href={a.href}><Notice tone={a.tone}>{a.text}</Notice></Link></li>)}</ul> : <p className="muted">Nothing needs your attention right now.</p>}
      </Card>
      <Card title="Active orders">
        {active.length ? (
          <ul className="divide-y divide-slate-100">
            {active.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/account/orders/${o.id}`} className="font-semibold hover:underline">{o.quote.listing?.title ?? o.quote.sourcingOffer?.vehicleDescription}</Link>
                  <p className="text-xs text-slate-500">{o.orderNumber} · placed <LocalTime iso={o.createdAt} mode="date" /></p>
                </div>
                <div className="flex items-center gap-3"><StateBadge state={o.state} /><span className="text-sm tabular-nums">{formatMoney(o.agreedTotal, "NGN", { compact: true })}</span></div>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No active orders" action={<Link href="/vehicles" className="btn-primary">Find a vehicle</Link>}>When you accept a quote, your order and its progress appear here.</EmptyState>}
      </Card>
    </div>
  );
}
