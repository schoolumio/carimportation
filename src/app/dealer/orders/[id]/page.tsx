import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { orderTimeline } from "@/server/orders/service";
import { documentsForOrder } from "@/server/documents/service";
import { nextStates, STATE_LABEL } from "@/server/orders/state-machine";
import { MILESTONE_LABEL } from "@/server/settlement/settlement";
import { ActivityLog, JourneyProgress, StateBadge } from "@/components/OrderTimeline";
import { Badge, Card, Flash, KeyValue, Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { BENEFICIARY_LABEL, SETTLEMENT_STATUS_LABEL } from "@/lib/labels";
import { dealerBookingAction, dealerCostAction, dealerMilestoneAction, dealerOrderDocAction } from "../../actions";

export default async function DealerOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const order = await prisma.order.findUnique({ where: { id }, include: { quote: { include: { listing: true, sourcingOffer: true } }, settlements: true, delivery: true, costAdjustments: true } });
  if (!order || !order.dealerOrgId || !actor.dealerOrgIds.includes(order.dealerOrgId)) notFound();
  const [{ transitions, shipment }, docs] = await Promise.all([orderTimeline(id), documentsForOrder(actor, id)]);
  const allowed = nextStates(order.path, order.state).filter((t) => t.performers.includes("order.transition.dealer"));
  const dealerSettlements = order.settlements.filter((s) => s.dealerOrgId === order.dealerOrgId);
  return (
    <div className="space-y-6">
      <PageHeader title={order.quote.listing?.title ?? order.quote.sourcingOffer?.vehicleDescription ?? "Order"} subtitle={`Order ${order.orderNumber}`} crumbs={[{ href: "/dealer/orders", label: "Orders" }]} actions={<StateBadge state={order.state} />} />
      <Flash sp={sp} />
      <Notice>You see the information needed to fulfil this order. Payment confirmation, inspections and fund releases are controlled by the platform — dealer status updates never release money.</Notice>
      <Card title="Progress"><JourneyProgress path={order.path} state={order.state} transitions={transitions} /></Card>
      <Card title="Your next actions">
        {allowed.length ? allowed.map((t) => (
          <form key={t.to} action={dealerMilestoneAction} className="mb-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="orderId" value={id} /><input type="hidden" name="to" value={t.to} />
            <div><p className="font-medium">{STATE_LABEL[t.to]}</p><p className="text-xs text-slate-500">{t.label}{t.evidenceRequired && " — evidence required"}</p><input name="description" className="input mt-1" placeholder="Details (optional)" /></div>
            <input type="file" name="file" required={t.evidenceRequired} accept="application/pdf,image/*" className="text-sm" />
            <button className="btn-primary btn-sm">Record</button>
          </form>
        )) : <p className="muted">No dealer actions at this stage. Platform operations or assigned partners handle the current step.</p>}
        {shipment && (
          <form action={dealerBookingAction} className="mt-2 grid gap-2 sm:grid-cols-5">
            <input type="hidden" name="orderId" value={id} />
            <input name="bookingRef" className="input" placeholder="Booking ref" defaultValue={shipment.bookingRef ?? ""} />
            <input name="vesselName" className="input" placeholder="Vessel" defaultValue={shipment.vesselName ?? ""} />
            <input name="voyageNumber" className="input" placeholder="Voyage" defaultValue={shipment.voyageNumber ?? ""} />
            <input name="billOfLading" className="input" placeholder="Bill of lading" defaultValue={shipment.billOfLading ?? ""} />
            <button className="btn-secondary btn-sm">Save booking</button>
          </form>
        )}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your settlements">
          <ul className="space-y-2 text-sm">{dealerSettlements.map((s) => <li key={s.id} className="flex justify-between gap-2"><span>{MILESTONE_LABEL[s.milestone]}<br /><span className="text-xs text-slate-500">{s.description}</span></span><span className="text-right">{formatMoney(s.amount, "NGN", { compact: true })}<br /><Badge tone={s.status === "RELEASED" ? "verified" : "neutral"}>{SETTLEMENT_STATUS_LABEL[s.status]}</Badge></span></li>)}</ul>
          <p className="mt-2 text-xs text-slate-500">Platform commission is deducted under your commercial agreement and shown as a separate platform settlement.</p>
        </Card>
        <Card title="Documents">
          <ul className="space-y-1 text-sm">{docs.map((d) => <li key={d.id}><a className="link" href={d.link}>{d.filename}</a> · {d.category}</li>)}</ul>
          <form action={dealerOrderDocAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="orderId" value={id} /><select name="category" className="input w-auto"><option value="purchase-invoice">Purchase invoice</option><option value="title-document">Title / ownership</option><option value="export-document">Export document</option><option value="photos">Photos</option></select><input type="file" name="file" required className="text-sm" /><button className="btn-secondary btn-sm">Upload</button></form>
        </Card>
      </div>
      <Card title="Submit an additional cost">
        <form action={dealerCostAction} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="orderId" value={id} />
          <input name="code" className="input" placeholder="Code e.g. STORAGE_FEE" required />
          <input name="label" className="input" placeholder="Label shown to buyer" required />
          <input name="amount" className="input" placeholder="Amount (₦)" required />
          <select name="beneficiary" className="input">{Object.entries(BENEFICIARY_LABEL).filter(([k]) => k !== "CONTINGENCY_RESERVE").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="clause" className="input" placeholder="Contract clause (if contractual)" />
          <input type="file" name="file" required className="text-sm" />
          <textarea name="reason" className="input sm:col-span-3" placeholder="Why did this cost arise?" required />
          <div><button className="btn-secondary btn-sm">Submit for review</button></div>
        </form>
        <ul className="mt-3 space-y-1 text-sm">{order.costAdjustments.map((c) => <li key={c.id}>{c.label} {formatMoney(c.amount)} — {c.status.replace(/_/g, " ").toLowerCase()}</li>)}</ul>
      </Card>
      <Card title="Activity"><ActivityLog transitions={transitions} events={shipment?.events ?? []} etaRevisions={shipment?.etaRevisions ?? []} /></Card>
      <KeyValue items={[["Delivery area", order.delivery?.address?.split("(").pop()?.replace(")", "") ?? "—"], ["Placed", <LocalTime key="p" iso={order.createdAt} />]]} />
    </div>
  );
}
