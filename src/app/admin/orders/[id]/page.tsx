import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { can } from "@/server/auth/actor";
import { orderTimeline } from "@/server/orders/service";
import { nextStates, PATH_LABEL, STATE_LABEL } from "@/server/orders/state-machine";
import { MILESTONE_LABEL } from "@/server/settlement/settlement";
import { orderHeldBalance } from "@/server/ledger/ledger";
import { refundableBalance } from "@/server/payments/refunds";
import { signDocumentLink } from "@/server/documents/service";
import { ActivityLog, JourneyProgress, StateBadge } from "@/components/OrderTimeline";
import { CostBreakdown } from "@/components/CostBreakdown";
import { Badge, Card, DemoTag, Field, Flash, KeyValue, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { breakdownFromQuote } from "@/lib/serialize";
import { formatMoney } from "@/lib/money";
import { BENEFICIARY_LABEL, PAYMENT_STATUS_LABEL, SETTLEMENT_STATUS_LABEL } from "@/lib/labels";
import {
  adminTransitionAction, adminUploadOrderDocAction, assignPartnerAction, complianceAction, createShipmentAction, docReviewAction, refundRequestAction,
  settlementApproveAction, settlementRequestAction, costReviewAction,
} from "../../actions";

export default async function AdminOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePerm("order.view.all");
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      buyer: { include: { buyerProfile: true } }, dealerOrg: true, contract: true, escrow: true, delivery: true, complianceChecks: true, refunds: true,
      quote: { include: { lineItems: { orderBy: { sortOrder: "asc" } }, listing: true, sourcingOffer: true } },
      paymentIntents: { include: { transactions: true, buyerProofs: true } }, settlements: { orderBy: { createdAt: "asc" } }, costAdjustments: true, disputes: true,
    },
  });
  if (!order) notFound();
  const [{ transitions, shipment }, docs, held, refundable, partners, assignments] = await Promise.all([
    orderTimeline(id), prisma.shipment.findUnique({ where: { orderId: id }, select: { id: true } }).then((s) => prisma.document.findMany({ where: { OR: [{ orderId: id }, ...(s ? [{ shipmentId: s.id }] : [])] }, orderBy: { createdAt: "desc" } })),
    orderHeldBalance(prisma, id, order.currency), refundableBalance(id, order.currency),
    prisma.user.findMany({ where: { roles: { some: { role: { key: { in: ["LOGISTICS_OPERATOR", "CLEARING_PARTNER", "DELIVERY_PARTNER"] } } } } }, include: { roles: { include: { role: true } } } }),
    prisma.shipmentAssignment.findMany({ where: { shipment: { orderId: id } }, include: { user: true } }),
  ]);
  const opsPerms = ["order.transition.ops", "order.transition.logistics", "order.transition.clearing", "order.transition.delivery", "compliance.review"].filter((p) => can(actor, p as never));
  const allowed = nextStates(order.path, order.state).filter((t) => t.performers.some((p) => opsPerms.includes(p)));
  const back = `/admin/orders/${id}`;
  const B = () => <input type="hidden" name="back" value={back} />;
  return (
    <div className="space-y-6">
      <PageHeader title={`Order ${order.orderNumber}`} subtitle={<>{order.quote.listing?.title ?? order.quote.sourcingOffer?.vehicleDescription} · {PATH_LABEL[order.path]} {order.isDemo && <DemoTag />}</>} crumbs={[{ href: "/admin/orders", label: "Orders" }]} actions={<StateBadge state={order.state} />} />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Parties">
          <KeyValue items={[["Buyer", `${order.buyer.fullName} (${order.buyer.email})`], ["Identity", order.buyer.buyerProfile?.identityStatus?.toLowerCase()], ["Seller", order.dealerOrg?.tradingName ?? "Platform inventory"], ["Payment arrangement", order.paymentArrangement], ["Escrow ref", order.escrow ? `${order.escrow.status} ${order.escrow.externalReference ?? ""}` : "—"], ["Held (ledger)", formatMoney(held)], ["Refundable now", formatMoney(refundable)]]} />
        </Card>
        <Card title="Compliance">
          {order.complianceChecks.length ? order.complianceChecks.map((c) => (
            <div key={c.id} className="mb-2 text-sm">
              <p><Badge tone={c.status === "PASSED" ? "verified" : c.status === "REQUIRED" ? "pending" : "danger"}>{c.status.toLowerCase()}</Badge> {c.type.replace(/_/g, " ").toLowerCase()} — {c.reason}</p>
              {c.status === "REQUIRED" && can(actor, "compliance.review") && c.type !== "IDENTITY" && (
                <form action={complianceAction} className="mt-1 flex gap-1"><B /><input type="hidden" name="checkId" value={c.id} /><input name="notes" className="input" placeholder="Review notes" required /><button name="decision" value="PASSED" className="btn-secondary btn-sm">Pass</button><button name="decision" value="FAILED" className="btn-ghost btn-sm text-danger">Fail</button></form>
              )}
            </div>
          )) : <p className="muted">No checks required.</p>}
          <p className="text-xs text-slate-500">Identity checks are cleared from the Compliance queue after document review.</p>
        </Card>
        <Card title="Delivery">
          <KeyValue items={[["Address", order.delivery?.address], ["Scheduled", order.delivery?.scheduledFor ? <LocalTime key="s" iso={order.delivery.scheduledFor} /> : null], ["Delivered", order.delivery?.deliveredAt ? <LocalTime key="d" iso={order.delivery.deliveredAt} /> : null], ["Acceptance deadline", order.acceptanceDeadline ? <LocalTime key="a" iso={order.acceptanceDeadline} /> : null]]} />
        </Card>
      </div>

      <Card title="Progress"><JourneyProgress path={order.path} state={order.state} transitions={transitions} /></Card>

      <Card title="Record milestone (operations)">
        {allowed.length ? allowed.map((t) => (
          <form key={t.to} action={adminTransitionAction} className="mb-3 grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <B /><input type="hidden" name="orderId" value={id} /><input type="hidden" name="to" value={t.to} />
            <div><p className="font-medium">{STATE_LABEL[t.to]}</p><p className="text-xs text-slate-500">{t.label}{t.evidenceRequired && " — evidence required"}{t.performers.includes("SYSTEM") && t.performers.length === 1 && " (system only)"}</p><input name="description" className="input mt-1" placeholder={t.to === "CANCELLED" ? "Cancellation reason (required)" : "Details"} /></div>
            <input type="file" name="file" required={t.evidenceRequired} accept="application/pdf,image/*" className="text-sm" />
            <button className={t.to === "CANCELLED" ? "btn-danger btn-sm" : "btn-primary btn-sm"}>Record</button>
          </form>
        )) : <p className="muted">No manual transitions available. Payment confirmation and protected-funds steps are performed only by the system from verified payment records.</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Shipment & partners">
          {shipment ? (
            <>
              <KeyValue items={[["Reference", shipment.reference], ["Vessel", shipment.vesselName], ["Booking", shipment.bookingRef], ["B/L", shipment.billOfLading], ["Original ETA", shipment.originalEtaStart ? `${shipment.originalEtaStart.toISOString().slice(0, 10)} – ${shipment.originalEtaEnd?.toISOString().slice(0, 10)}` : null], ["Current ETA", shipment.currentEtaStart ? `${shipment.currentEtaStart.toISOString().slice(0, 10)} – ${shipment.currentEtaEnd?.toISOString().slice(0, 10)}` : null]]} />
              <p className="mt-3 text-sm font-semibold">Assigned partners</p>
              <ul className="text-sm">{assignments.map((a) => <li key={a.id}>{a.role.replace(/_/g, " ").toLowerCase()}: {a.user.fullName} ({a.user.email})</li>)}</ul>
              {can(actor, "shipment.manage") && (
                <form action={assignPartnerAction} className="mt-2 flex flex-wrap gap-2"><B /><input type="hidden" name="shipmentId" value={shipment.id} />
                  <select name="userId" className="input w-auto">{partners.map((p) => <option key={p.id} value={p.id}>{p.fullName} — {p.roles.map((r) => r.role.key).join(",")}</option>)}</select>
                  <select name="role" className="input w-auto"><option value="LOGISTICS_OPERATOR">Logistics</option><option value="CLEARING_PARTNER">Clearing</option><option value="DELIVERY_PARTNER">Delivery</option></select>
                  <button className="btn-secondary btn-sm">Assign</button>
                </form>
              )}
              <a className="link mt-2 block text-sm" href={`/partner/shipments/${shipment.id}`}>Open shipment workspace →</a>
            </>
          ) : can(actor, "shipment.manage") ? (
            <form action={createShipmentAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="orderId" value={id} />
              <label className="block"><span className="label">Method</span><select name="method" className="input"><option value="RORO">RoRo</option><option value="CONTAINER">Container</option><option value="LOCAL_ONLY">Local only</option></select></label>
              <Field label="Origin port" name="originPort" defaultValue={order.quote.listing?.originPort ?? ""} />
              <Field label="Initial ETA from" name="etaStart" type="date" /><Field label="to" name="etaEnd" type="date" />
              <button className="btn-primary btn-sm w-fit">Open shipment record</button>
            </form>
          ) : <p className="muted">No shipment yet.</p>}
        </Card>

        <Card title="Payments">
          <ul className="space-y-2 text-sm">{order.paymentIntents.map((p) => (
            <li key={p.id} className="rounded border border-slate-200 p-2">
              <p className="font-medium">{p.reference} · {p.purpose.toLowerCase().replace("_", " ")} · {PAYMENT_STATUS_LABEL[p.status]}</p>
              <p className="text-xs text-slate-500">{formatMoney(p.amountReceived)} received of {formatMoney(p.amount)} via {p.provider}</p>
              {p.transactions.map((t) => <p key={t.id} className="text-xs">↳ {t.type} {t.providerTxnId} {formatMoney(t.amount)} {t.status} · recon {t.reconciliation.toLowerCase()}</p>)}
              {p.buyerProofs.length > 0 && <p className="text-xs text-amber-700">Buyer uploaded {p.buyerProofs.length} receipt(s) — not proof of payment; check the statement.</p>}
            </li>
          ))}</ul>
          {can(actor, "refund.request") && refundable.gt(0) && (
            <form action={refundRequestAction} className="mt-3 flex flex-wrap gap-2"><B /><input type="hidden" name="orderId" value={id} /><input name="amount" className="input w-36" placeholder="Amount" defaultValue={refundable.toFixed(2)} /><input name="reason" className="input flex-1" placeholder="Reason" required /><button className="btn-secondary btn-sm">Request refund</button></form>
          )}
          <ul className="mt-2 text-xs">{order.refunds.map((r) => <li key={r.id}>Refund {formatMoney(r.amount)} — {r.status.toLowerCase()} ({r.reason})</li>)}</ul>
        </Card>
      </div>

      <Card title="Settlement instructions (maker-checker)">
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Milestone</th><th>Description</th><th>Beneficiary</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">{order.settlements.map((s) => (
            <tr key={s.id}><td className="text-xs">{MILESTONE_LABEL[s.milestone]}</td><td>{s.description}</td><td>{BENEFICIARY_LABEL[s.beneficiary]}</td><td className="text-right tabular-nums">{formatMoney(s.amount)}</td><td><Badge tone={s.status === "RELEASED" ? "verified" : s.status === "BLOCKED_BY_DISPUTE" ? "danger" : s.status === "ELIGIBLE" ? "pending" : "neutral"}>{SETTLEMENT_STATUS_LABEL[s.status]}</Badge></td>
              <td>
                {s.status === "ELIGIBLE" && can(actor, "settlement.request") && <form action={settlementRequestAction}><B /><input type="hidden" name="id" value={s.id} /><button className="btn-secondary btn-sm">Request release</button></form>}
                {s.status === "APPROVAL_REQUESTED" && can(actor, "settlement.approve") && (s.requestedById === actor.userId ? <span className="text-xs text-slate-500">Awaiting another approver</span> : <form action={settlementApproveAction}><B /><input type="hidden" name="id" value={s.id} /><button className="btn-primary btn-sm">Approve release</button></form>)}
              </td></tr>
          ))}</tbody>
        </table></div>
      </Card>

      {order.costAdjustments.length > 0 && (
        <Card title="Additional costs">
          <ul className="space-y-2 text-sm">{order.costAdjustments.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2"><span>{c.label} · {formatMoney(c.amount)} · {c.status.replace(/_/g, " ").toLowerCase()} — {c.reason}</span>
              {c.status === "PENDING_INTERNAL_REVIEW" && can(actor, "cost.review") && <form action={costReviewAction} className="flex gap-1"><B /><input type="hidden" name="costId" value={c.id} /><button name="decision" value="SEND_TO_BUYER" className="btn-secondary btn-sm">Send to buyer</button>{c.contractualClause && <button name="decision" value="CONTRACTUAL_EXCEPTION" className="btn-secondary btn-sm">Contractual</button>}<button name="decision" value="REJECT" className="btn-ghost btn-sm text-danger">Reject</button></form>}
            </li>
          ))}</ul>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Documents">
          <ul className="divide-y divide-slate-100 text-sm">{docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span><a className="link" href={signDocumentLink(d.id, actor.userId)}>{d.filename}</a> <span className="text-xs text-slate-500">{d.category} · {d.visibility.toLowerCase().replace(/_/g, " ")}</span></span>
              {d.reviewStatus === "PENDING" && can(actor, "document.review") ? <form action={docReviewAction} className="flex gap-1"><B /><input type="hidden" name="documentId" value={d.id} /><button name="status" value="ACCEPTED" className="btn-secondary btn-sm">Accept</button><button name="status" value="REJECTED" className="btn-ghost btn-sm text-danger">Reject</button></form> : <Badge tone={d.reviewStatus === "ACCEPTED" ? "verified" : d.reviewStatus === "REJECTED" ? "danger" : "pending"}>{d.reviewStatus.toLowerCase()}</Badge>}
            </li>
          ))}</ul>
          <form action={adminUploadOrderDocAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="orderId" value={id} />
            <input name="category" className="input w-40" placeholder="Category" required />
            <select name="visibility" className="input w-auto"><option value="ORDER_PARTIES">All order parties</option><option value="BUYER_AND_INTERNAL">Buyer + staff</option><option value="DEALER_AND_INTERNAL">Dealer + staff</option><option value="INTERNAL">Internal only</option></select>
            <input type="file" name="file" required className="text-sm" /><button className="btn-secondary btn-sm">Upload</button>
          </form>
        </Card>
        <Card title="Activity & audit trail"><ActivityLog transitions={transitions} events={shipment?.events ?? []} etaRevisions={shipment?.etaRevisions ?? []} /></Card>
      </div>
      <Card title="Agreed quote"><CostBreakdown data={breakdownFromQuote(order.quote)} /></Card>
    </div>
  );
}
