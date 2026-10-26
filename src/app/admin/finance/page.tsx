import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { can } from "@/server/auth/actor";
import { accountsWithBalances, trialBalance } from "@/server/ledger/ledger";
import { MILESTONE_LABEL } from "@/server/settlement/settlement";
import { Badge, Card, Flash, Notice, PageHeader, Stat } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { BENEFICIARY_LABEL, SETTLEMENT_STATUS_LABEL } from "@/lib/labels";
import { manualApproveAction, manualRecordAction, payoutApproveAction, payoutRejectAction, reconcileAction, refundApproveAction, refundRejectAction, settlementApproveAction, settlementRequestAction } from "../actions";

export const metadata = { title: "Finance & escrow" };

export default async function Finance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requirePerm("ledger.view");
  const [manualIntents, manualPending, settlements, refunds, payouts, runs, tb, accounts, webhooks, unrec] = await Promise.all([
    prisma.paymentIntent.findMany({ where: { provider: "MANUAL_PILOT", status: { in: ["PENDING", "PARTIALLY_PAID"] } }, include: { order: true, buyerProofs: true } }),
    prisma.providerTransaction.findMany({ where: { provider: "MANUAL_PILOT", status: "PENDING" }, include: { paymentIntent: { include: { order: true } } } }),
    prisma.settlementInstruction.findMany({ where: { status: { in: ["ELIGIBLE", "APPROVAL_REQUESTED", "BLOCKED_BY_DISPUTE"] } }, include: { order: true }, orderBy: { eligibleAt: "asc" } }),
    prisma.refund.findMany({ where: { status: "REQUESTED" }, include: { order: true } }),
    prisma.payout.findMany({ where: { status: "REQUESTED" }, include: { dealerOrg: true } }),
    prisma.reconciliationRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    trialBalance(), accountsWithBalances(),
    prisma.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 15 }),
    prisma.providerTransaction.count({ where: { reconciliation: { in: ["UNRECONCILED", "MISMATCHED"] }, status: "SUCCEEDED" } }),
  ]);
  const provider = process.env.PAYMENT_PROVIDER ?? "SANDBOX";
  const dual = (requester: string | null) => requester === actor.userId;
  return (
    <div className="space-y-6">
      <PageHeader title="Finance & escrow operations" subtitle={`Provider: ${provider}. All releases, refunds and manual confirmations require two different authorised users.`} />
      <Flash sp={sp} />
      {provider === "SANDBOX" && <Notice tone="warning">Sandbox mode: provider transactions are simulated. Ledger, reconciliation and approval controls behave as in production.</Notice>}
      <div className="grid gap-3 sm:grid-cols-4">
        {tb.map((r) => <Stat key={r.currency} label={`Trial balance ${r.currency}`} value={r.balanced ? "Balanced" : "UNBALANCED"} tone={r.balanced ? "verified" : "danger"} hint={`Debits ${formatMoney(r.debits, r.currency, { compact: true })} = credits ${formatMoney(r.credits, r.currency, { compact: true })}`} />)}
        <Stat label="Unreconciled provider txns" value={unrec} tone={unrec ? "pending" : "verified"} />
        <Stat label="Settlements awaiting action" value={settlements.filter((s) => s.status !== "BLOCKED_BY_DISPUTE").length} />
        <Stat label="Refunds / payouts pending" value={`${refunds.length} / ${payouts.length}`} />
      </div>

      {(manualIntents.length > 0 || manualPending.length > 0) && (
        <Card title="Manual pilot payment confirmations">
          <p className="mb-2 text-xs text-slate-500">Record only credits seen on the official bank statement. Buyer receipts are never sufficient.</p>
          {can(actor, "payment.manual.record") && manualIntents.map((i) => (
            <form key={i.id} action={manualRecordAction} className="mb-2 grid gap-2 rounded border border-slate-200 p-2 text-sm md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-center">
              <input type="hidden" name="intentId" value={i.id} />
              <span>{i.order.orderNumber} · ref <code>{i.reference}</code> · due {formatMoney(i.amount.minus(i.amountReceived))} {i.buyerProofs.length > 0 && <Badge tone="pending">receipt uploaded</Badge>}</span>
              <input name="amount" className="input" placeholder="Amount on statement" required /><input name="bankRef" className="input" placeholder="Statement ref" required /><input name="occurredAt" type="date" className="input" />
              <button className="btn-secondary btn-sm">Record (maker)</button>
            </form>
          ))}
          {manualPending.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm">
              <span>{t.paymentIntent?.order.orderNumber} · {formatMoney(t.amount)} · statement {t.bankStatementRef}</span>
              {dual(t.recordedById) ? <span className="text-xs text-slate-500">Recorded by you — needs another approver</span> : can(actor, "payment.manual.approve") && <form action={manualApproveAction} className="flex gap-1"><input type="hidden" name="id" value={t.id} /><button name="decision" value="approve" className="btn-primary btn-sm">Approve (checker)</button><button name="decision" value="reject" className="btn-ghost btn-sm text-danger">Reject</button></form>}
            </div>
          ))}
        </Card>
      )}

      <Card title="Settlement queue">
        {!settlements.length ? <p className="muted">Nothing eligible for release.</p> : <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Order</th><th>Milestone</th><th>Beneficiary</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">{settlements.map((s) => (
            <tr key={s.id}><td><Link className="link" href={`/admin/orders/${s.orderId}`}>{s.order.orderNumber}</Link></td><td className="text-xs">{MILESTONE_LABEL[s.milestone]}<br />{s.description}</td><td>{BENEFICIARY_LABEL[s.beneficiary]}</td><td className="text-right tabular-nums">{formatMoney(s.amount)}</td><td><Badge tone={s.status === "BLOCKED_BY_DISPUTE" ? "danger" : "pending"}>{SETTLEMENT_STATUS_LABEL[s.status]}</Badge></td>
              <td>{s.status === "ELIGIBLE" && can(actor, "settlement.request") && <form action={settlementRequestAction}><input type="hidden" name="id" value={s.id} /><button className="btn-secondary btn-sm">Request</button></form>}
                {s.status === "APPROVAL_REQUESTED" && (dual(s.requestedById) ? <span className="text-xs text-slate-500">Needs another approver</span> : can(actor, "settlement.approve") && <form action={settlementApproveAction} className="flex gap-1"><input type="hidden" name="id" value={s.id} />{provider === "MANUAL_PILOT" && <input name="externalRef" className="input w-28" placeholder="Bank ref" required />}<button className="btn-primary btn-sm">Approve</button></form>)}</td></tr>
          ))}</tbody>
        </table></div>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Refund requests">
          {!refunds.length ? <p className="muted">None.</p> : refunds.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
              <span><Link className="link" href={`/admin/orders/${r.orderId}`}>{r.order.orderNumber}</Link> · {formatMoney(r.amount)} · {r.reason}</span>
              {dual(r.requestedById) ? <span className="text-xs text-slate-500">Requested by you</span> : can(actor, "refund.approve") && <span className="flex gap-1"><form action={refundApproveAction} className="flex gap-1"><input type="hidden" name="id" value={r.id} />{provider === "MANUAL_PILOT" && <input name="externalRef" className="input w-28" placeholder="Bank ref" required />}<button className="btn-primary btn-sm">Approve & pay</button></form><form action={refundRejectAction}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost btn-sm text-danger">Reject</button></form></span>}
            </div>
          ))}
        </Card>
        <Card title="Dealer payout requests">
          {!payouts.length ? <p className="muted">None.</p> : payouts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
              <span>{p.dealerOrg.tradingName} · {formatMoney(p.amount)} · ••••{p.dealerOrg.bankAccountLast4}</span>
              {can(actor, "payout.review") && <span className="flex gap-1"><form action={payoutApproveAction} className="flex gap-1"><input type="hidden" name="id" value={p.id} />{provider === "MANUAL_PILOT" && <input name="externalRef" className="input w-28" placeholder="Bank ref" required />}<button className="btn-primary btn-sm">Pay</button></form><form action={payoutRejectAction}><input type="hidden" name="id" value={p.id} /><button className="btn-ghost btn-sm text-danger">Reject</button></form></span>}
            </div>
          ))}
        </Card>
      </div>

      <Card title="Reconciliation" actions={can(actor, "reconciliation.run") ? <form action={reconcileAction} className="flex gap-1"><select name="hours" className="input w-auto"><option value="24">Last 24h</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select><button className="btn-secondary btn-sm">Run now</button></form> : undefined}>
        {!runs.length ? <p className="muted">No reconciliation runs yet. The worker runs one daily.</p> : <ul className="divide-y divide-slate-100 text-sm">{runs.map((r) => {
          const rep = r.report as { missingInternal?: unknown[]; mismatched?: unknown[]; positionDifference?: string };
          return <li key={r.id} className="py-2"><Badge tone={r.ledgerBalanced && !r.mismatched && !r.missingInternal ? "verified" : "danger"}>{r.ledgerBalanced && !r.mismatched && !r.missingInternal ? "Clean" : "Exceptions"}</Badge> <LocalTime iso={r.createdAt} /> · {r.provider} · {r.matched} matched · {r.mismatched} mismatched · {r.missingInternal} missing internally · position diff {rep.positionDifference}</li>;
        })}</ul>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Ledger accounts">
          <div className="max-h-96 overflow-auto"><table className="table"><thead><tr><th>Account</th><th>Type</th><th className="text-right">Balance</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{accounts.filter((a) => !a.balance.isZero() || a.type !== "LIABILITY").map((a) => <tr key={a.id}><td className="text-xs">{a.code.replace(/LIAB:BUYER_FUNDS:/, "Buyer funds · ")}</td><td className="text-xs">{a.type}</td><td className="text-right tabular-nums">{formatMoney(a.balance, a.currency)}</td></tr>)}</tbody>
          </table></div>
        </Card>
        <Card title="Recent payment webhooks">
          <ul className="space-y-1 text-xs">{webhooks.map((w) => <li key={w.id}><Badge tone={w.status === "PROCESSED" ? "verified" : w.status === "DUPLICATE" ? "neutral" : "danger"}>{w.status.toLowerCase()}</Badge> {w.eventType} · attempts {w.attempts} · sig {w.signatureValid ? "valid" : "INVALID"} · <LocalTime iso={w.receivedAt} /> {w.error && `· ${w.error}`}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
