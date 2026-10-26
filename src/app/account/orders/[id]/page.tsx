import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { getOrderForActor, orderTimeline } from "@/server/orders/service";
import { documentsForOrder } from "@/server/documents/service";
import { orderHeldBalance } from "@/server/ledger/ledger";
import { MILESTONE_LABEL } from "@/server/settlement/settlement";
import { CATEGORY_LABEL } from "@/server/disputes/service";
import { PATH_LABEL } from "@/server/orders/state-machine";
import { ActivityLog, JourneyProgress, StateBadge } from "@/components/OrderTimeline";
import { CostBreakdown } from "@/components/CostBreakdown";
import { Badge, Card, DemoTag, Flash, KeyValue, Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { breakdownFromQuote } from "@/lib/serialize";
import { formatMoney } from "@/lib/money";
import { BENEFICIARY_LABEL, DISPUTE_STATUS_LABEL, PAYMENT_STATUS_LABEL, SETTLEMENT_STATUS_LABEL } from "@/lib/labels";
import type { PaymentInstructions } from "@/server/payments/provider";
import {
  acceptVehicleAction, cancelOrderAction, costDecisionAction, disputeEvidenceAction, raiseDisputeAction, simulatePaymentAction,
  uploadOrderDocAction, uploadProofAction, withdrawDisputeAction,
} from "../../actions";

export const metadata = { title: "Order details" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor(`/account/orders/${id}`);
  let base;
  try { base = await getOrderForActor(actor, id); } catch { notFound(); }
  if (base.buyerId !== actor.userId) notFound(); // staff and partners use their own consoles
  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: {
      quote: { include: { lineItems: { orderBy: { sortOrder: "asc" } }, listing: true, sourcingOffer: true } },
      paymentIntents: { orderBy: { createdAt: "asc" } }, escrow: true, settlements: { orderBy: { createdAt: "asc" } }, refunds: true,
      costAdjustments: { orderBy: { createdAt: "desc" } }, delivery: true, contract: true, complianceChecks: true,
      disputes: { include: { evidence: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } }, dealerOrg: true,
    },
  });
  const [{ transitions, shipment }, docs, held] = await Promise.all([orderTimeline(id), documentsForOrder(actor, id), orderHeldBalance(prisma, id, order.currency)]);
  const title = order.quote.listing?.title ?? order.quote.sourcingOffer?.vehicleDescription ?? "Vehicle";
  const pending = order.paymentIntents.filter((p) => ["PENDING", "PARTIALLY_PAID"].includes(p.status));
  const sandbox = (process.env.PAYMENT_PROVIDER ?? "SANDBOX") === "SANDBOX";
  const openDisputes = order.disputes.filter((d) => ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"].includes(d.status));
  const canDispute = !["ORDER_CREATED", "COMPLIANCE_CHECK", "AWAITING_PAYMENT", "COMPLETED", "REFUNDED", "CANCELLED"].includes(order.state);
  const back = `/account/orders/${id}`;
  const paid = order.paymentIntents.some((p) => p.purpose === "ORDER_PAYMENT" && p.status === "SUCCEEDED");

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={<>Order {order.orderNumber} · {PATH_LABEL[order.path]} {order.isDemo && <DemoTag />}</>} crumbs={[{ href: "/account/orders", label: "Orders" }]} actions={<StateBadge state={order.state} />} />
      <Flash sp={sp} />

      {order.state === "COMPLIANCE_CHECK" && (
        <Notice tone="warning" title="Verification required before payment">
          {order.complianceChecks.filter((c) => c.status === "REQUIRED").map((c) => c.reason).join(". ")}. <Link className="link" href="/account/profile#identity">Submit or check your identity verification</Link>.
        </Notice>
      )}
      {openDisputes.length > 0 && <Notice tone="warning" title="Dispute open">Eligible unreleased funds are frozen while the dispute is investigated. Logistics may continue.</Notice>}

      {pending.map((p) => {
        const ins = p.instructions as unknown as PaymentInstructions;
        return (
          <Card key={p.id} title={p.purpose === "ADDITIONAL_COST" ? "Payment due: approved additional charge" : "Payment instructions"}>
            <div className="grid gap-4 md:grid-cols-2">
              <KeyValue items={[["Amount", formatMoney(p.amount.minus(p.amountReceived), p.currency)], ["Reference (required)", <code key="r" className="rounded bg-slate-100 px-1">{p.reference}</code>], ["Bank", ins.bankName], ["Account name", ins.accountName], ["Account number", ins.accountNumber], ["Pay by", <LocalTime key="e" iso={p.expiresAt} />], ["Status", PAYMENT_STATUS_LABEL[p.status]]]} />
              <div className="space-y-3 text-sm">
                <ul className="list-disc space-y-1 pl-5 text-slate-600">{ins.notes?.map((n, i) => <li key={i}>{n}</li>)}</ul>
                <p className="text-xs text-slate-500">Only pay to the account shown here. We will never ask you to pay a dealer directly or to a different account by phone or WhatsApp.</p>
                {sandbox && (
                  <form action={simulatePaymentAction} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <input type="hidden" name="intentId" value={p.id} />
                    <p className="text-xs font-semibold text-amber-900">Sandbox simulator — no real money</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button name="mode" value="full" className="btn-primary btn-sm">Simulate full bank transfer</button>
                      <button name="mode" value="partial" className="btn-secondary btn-sm">Simulate partial transfer</button>
                    </div>
                  </form>
                )}
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Already paid? Upload your transfer receipt</summary>
                  <form action={uploadProofAction} className="mt-2 space-y-2">
                    <input type="hidden" name="intentId" value={p.id} />
                    <input type="file" name="file" accept="application/pdf,image/*" required className="text-sm" />
                    <input name="note" className="input" placeholder="Bank, date, sender name (optional)" />
                    <button className="btn-secondary btn-sm">Upload receipt</button>
                    <p className="text-xs text-slate-500">A receipt prompts finance to check the bank statement. It does not confirm payment.</p>
                  </form>
                </details>
              </div>
            </div>
          </Card>
        );
      })}

      {order.costAdjustments.filter((c) => c.status === "AWAITING_BUYER_APPROVAL").map((c) => (
        <Card key={c.id} title="Additional charge awaiting your approval">
          <p className="text-sm"><strong>{c.label}: {formatMoney(c.amount)}</strong> — paid to {BENEFICIARY_LABEL[c.beneficiary]}</p>
          <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
          {c.evidenceDocumentId && <p className="mt-1 text-xs">Evidence: see documents below.</p>}
          <form action={costDecisionAction} className="mt-3 flex gap-2">
            <input type="hidden" name="orderId" value={id} /><input type="hidden" name="costId" value={c.id} />
            <button name="decision" value="approve" className="btn-primary btn-sm">Approve & get payment instructions</button>
            <button name="decision" value="reject" className="btn-secondary btn-sm">Reject</button>
          </form>
        </Card>
      ))}

      {order.state === "ACCEPTANCE_PERIOD" && (
        <Card title="Inspect your vehicle">
          <p className="text-sm text-slate-700">Your inspection period ends <strong><LocalTime iso={order.acceptanceDeadline} /></strong>. If everything matches the listing and contract, accept the vehicle. If not, report a problem before the deadline — otherwise the vehicle is deemed accepted.</p>
          <form action={acceptVehicleAction} className="mt-3 space-y-2">
            <input type="hidden" name="orderId" value={id} />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" required className="mt-1" /> I have inspected the vehicle and it matches the agreed description.</label>
            <button className="btn-primary">Accept vehicle</button>
          </form>
        </Card>
      )}

      <Card title="Progress">
        <JourneyProgress path={order.path} state={order.state} transitions={transitions} />
      </Card>

      {shipment && (
        <Card title="Shipment">
          <KeyValue items={[
            ["Shipment reference", shipment.reference], ["Method", shipment.method === "RORO" ? "Roll-on/roll-off" : shipment.method.toLowerCase()], ["Vessel", shipment.vesselName], ["Voyage", shipment.voyageNumber],
            ["Bill of lading", shipment.billOfLading], ["Origin → destination", `${shipment.originPort ?? "—"} → ${shipment.destinationPort}`],
            ["Original arrival estimate", shipment.originalEtaStart ? <span key="o"><LocalTime iso={shipment.originalEtaStart} mode="date" /> – <LocalTime iso={shipment.originalEtaEnd} mode="date" /></span> : null],
            ["Current arrival estimate", shipment.currentEtaStart ? <span key="c"><LocalTime iso={shipment.currentEtaStart} mode="date" /> – <LocalTime iso={shipment.currentEtaEnd} mode="date" /></span> : null],
            ["Departed", shipment.actualDeparture ? <LocalTime key="d" iso={shipment.actualDeparture} /> : null], ["Arrived", shipment.actualArrival ? <LocalTime key="a" iso={shipment.actualArrival} /> : null],
            ["Last update received", shipment.lastUpdateAt ? <LocalTime key="l" iso={shipment.lastUpdateAt} /> : null], ["Tracking source", "Verified manual updates (no live carrier feed connected)"],
          ]} />
        </Card>
      )}

      <Card title="Activity & evidence log">
        <ActivityLog transitions={transitions} events={shipment?.events ?? []} etaRevisions={shipment?.etaRevisions ?? []} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Cost breakdown (as agreed)">
          <CostBreakdown data={breakdownFromQuote(order.quote, paid ? ["UPFRONT"] : [])} compact />
        </Card>
        <div className="space-y-6">
          <Card title="Payments & protected funds">
            <KeyValue items={[
              ["Payment arrangement", order.paymentArrangement === "SANDBOX_DEMO" ? "Sandbox demonstration (no real money)" : order.paymentArrangement === "MANUAL_PILOT" ? "Manual pilot (staff-verified bank transfer)" : "Authorised protected-funds partner"],
              ["Protected-funds status", order.escrow ? order.escrow.status.replace(/_/g, " ").toLowerCase() : "Not yet funded"],
              ["Currently held for this order", formatMoney(held)],
            ]} />
            <ul className="mt-3 space-y-1 text-sm">
              {order.paymentIntents.map((p) => <li key={p.id} className="flex justify-between"><span>{p.purpose === "ORDER_PAYMENT" ? "Order payment" : "Additional charge"} · {p.reference}</span><span>{formatMoney(p.amountReceived)} / {formatMoney(p.amount)} — {PAYMENT_STATUS_LABEL[p.status]}</span></li>)}
              {order.refunds.map((r) => <li key={r.id} className="flex justify-between text-slate-600"><span>Refund · {r.reason}</span><span>{formatMoney(r.amount)} — {r.status.toLowerCase()}</span></li>)}
            </ul>
          </Card>
          <Card title="Settlement schedule">
            <ul className="space-y-2 text-sm">
              {order.settlements.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span><span className="font-medium">{MILESTONE_LABEL[s.milestone]}</span><br /><span className="text-xs text-slate-500">{s.description} → {BENEFICIARY_LABEL[s.beneficiary] ?? s.beneficiary}</span></span>
                  <span className="text-right"><span className="tabular-nums">{formatMoney(s.amount, "NGN", { compact: true })}</span><br /><Badge tone={s.status === "RELEASED" ? "verified" : s.status === "BLOCKED_BY_DISPUTE" ? "danger" : "neutral"}>{SETTLEMENT_STATUS_LABEL[s.status]}</Badge></span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card title="Documents">
        {docs.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {docs.map((d) => <li key={d.id} className="flex justify-between gap-3 py-2"><span><a className="link" href={d.link}>{d.filename}</a> <span className="text-xs text-slate-500">· {d.category.replace(/-/g, " ")}</span> {d.isDemo && <DemoTag />}</span><LocalTime iso={d.createdAt} mode="date" /></li>)}
          </ul>
        ) : <p className="muted">No documents shared with you yet.</p>}
        <p className="mt-2 text-xs text-slate-500">Download links expire after 5 minutes; reload the page for fresh links.</p>
        <form action={uploadOrderDocAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="orderId" value={id} />
          <select name="category" className="input w-auto"><option value="buyer-upload">General</option><option value="requested-document">Requested document</option><option value="delivery-photos">Delivery photos</option></select>
          <input type="file" name="file" required accept="application/pdf,image/*,video/mp4" className="text-sm" />
          <button className="btn-secondary btn-sm">Upload</button>
        </form>
      </Card>

      <Card title="Disputes">
        {order.disputes.map((d) => (
          <div key={d.id} className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{d.reference}</span><Badge>{CATEGORY_LABEL[d.category]}</Badge><Badge tone={d.status === "DECISION_ISSUED" ? "verified" : "pending"}>{DISPUTE_STATUS_LABEL[d.status]}</Badge></div>
            <p className="mt-1 text-slate-600">{d.description}</p>
            {d.outcome && <p className="mt-1"><strong>Decision:</strong> {d.outcome.replace(/_/g, " ").toLowerCase()} — {d.decisionNotes}</p>}
            <ul className="mt-2 space-y-1 text-xs text-slate-500">{d.evidence.map((e) => <li key={e.id}>{e.partyRole.toLowerCase()}: {e.note} (<LocalTime iso={e.createdAt} />)</li>)}</ul>
            {["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"].includes(d.status) && (
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={disputeEvidenceAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="disputeId" value={d.id} /><input type="hidden" name="back" value={back} />
                  <input name="note" className="input w-64" placeholder="Add information" required />
                  <input type="file" name="file" accept="application/pdf,image/*" className="text-xs" />
                  <button className="btn-secondary btn-sm">Add evidence</button>
                </form>
                <form action={withdrawDisputeAction}><input type="hidden" name="disputeId" value={d.id} /><input type="hidden" name="back" value={back} /><button className="btn-ghost btn-sm">Withdraw</button></form>
              </div>
            )}
          </div>
        ))}
        {canDispute ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-danger">Report a problem / open a dispute</summary>
            <form action={raiseDisputeAction} className="mt-3 space-y-2">
              <input type="hidden" name="orderId" value={id} />
              <select name="category" className="input">{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <textarea name="description" required minLength={20} className="input min-h-[90px]" placeholder="Describe what is wrong, with dates and references." />
              <input type="file" name="file" accept="application/pdf,image/*,video/mp4" className="text-sm" />
              <button className="btn-danger btn-sm">Open dispute</button>
            </form>
          </details>
        ) : !order.disputes.length && <p className="muted">Disputes can be raised once funds are protected and until the order is completed.</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Contract record">
          {order.contract && (
            <>
              <p className="text-xs text-slate-500">Terms {order.contract.termsVersion} · accepted <LocalTime iso={order.contract.acceptedAt} /> · SHA-256 {order.contract.contentSha256.slice(0, 16)}…</p>
              <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">View agreed terms</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{order.contract.content}</pre></details>
            </>
          )}
        </Card>
        <Card title="Delivery & help">
          <KeyValue items={[["Delivery address", order.delivery?.address], ["Scheduled", order.delivery?.scheduledFor ? <LocalTime key="s" iso={order.delivery.scheduledFor} /> : null], ["Delivered", order.delivery?.deliveredAt ? <LocalTime key="d" iso={order.delivery.deliveredAt} /> : null], ["Seller", order.dealerOrg?.tradingName ?? "Platform inventory"]]} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/account/support?orderId=${id}`} className="btn-secondary btn-sm">Contact support about this order</Link>
            {["ORDER_CREATED", "COMPLIANCE_CHECK", "AWAITING_PAYMENT"].includes(order.state) && (
              <form action={cancelOrderAction} className="flex gap-2"><input type="hidden" name="orderId" value={id} /><input name="reason" className="input w-48" placeholder="Reason (optional)" /><button className="btn-ghost btn-sm text-danger">Cancel order</button></form>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
