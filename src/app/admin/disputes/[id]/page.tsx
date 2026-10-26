import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { can } from "@/server/auth/actor";
import { CATEGORY_LABEL } from "@/server/disputes/service";
import { refundableBalance } from "@/server/payments/refunds";
import { signDocumentLink } from "@/server/documents/service";
import { Badge, Card, Flash, KeyValue, Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { DISPUTE_STATUS_LABEL } from "@/lib/labels";
import { disputeAssignAction, disputeDecideAction, disputeNoteAction } from "../../actions";

export default async function AdminDispute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePerm("dispute.manage");
  const d = await prisma.dispute.findUnique({ where: { id }, include: { order: { include: { dealerOrg: true, settlements: true } }, raisedBy: true, evidence: { orderBy: { createdAt: "asc" } } } });
  if (!d) notFound();
  const refundable = await refundableBalance(d.orderId, d.order.currency);
  const released = d.order.settlements.filter((s) => s.status === "RELEASED").reduce((a, s) => a + Number(s.amount.toFixed(2)), 0);
  const open = ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"].includes(d.status);
  return (
    <div className="space-y-6">
      <PageHeader title={`Dispute ${d.reference}`} subtitle={<>{CATEGORY_LABEL[d.category]} · <Badge>{DISPUTE_STATUS_LABEL[d.status]}</Badge></>} crumbs={[{ href: "/admin/disputes", label: "Disputes" }]} actions={<Link className="btn-secondary" href={`/admin/orders/${d.orderId}`}>Open order</Link>} />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Summary">
          <KeyValue items={[["Order", d.order.orderNumber], ["Raised by", d.raisedBy.email], ["Seller", d.order.dealerOrg?.tradingName ?? "Platform"], ["Response due", <LocalTime key="r" iso={d.responseDueAt} />], ["Funds frozen", d.freezesFunds && open ? "Yes" : "No"], ["Unreleased refundable funds", formatMoney(refundable)], ["Already released (irreversible via escrow)", formatMoney(released)]]} />
          <p className="mt-3 text-sm">{d.description}</p>
          {open && !d.assignedToId && <form action={disputeAssignAction} className="mt-3"><input type="hidden" name="id" value={id} /><button className="btn-secondary btn-sm">Take ownership & investigate</button></form>}
        </Card>
        <Card title="Evidence & notes">
          <ul className="space-y-2 text-sm">{d.evidence.map((e) => <li key={e.id} className="rounded bg-slate-50 p-2"><span className="text-xs font-semibold uppercase text-slate-500">{e.partyRole}</span> · <LocalTime iso={e.createdAt} /><p>{e.note}</p>{e.documentId && <a className="link text-xs" href={signDocumentLink(e.documentId, actor.userId)}>attachment</a>}</li>)}</ul>
          {open && <form action={disputeNoteAction} className="mt-2 flex gap-2"><input type="hidden" name="id" value={id} /><input name="note" className="input" placeholder="Investigation note / evidence request" required /><button className="btn-secondary btn-sm">Add</button></form>}
        </Card>
      </div>
      {open ? (can(actor, "dispute.decide") ? (
        <Card title="Issue decision">
          <Notice>Refund outcomes create refund requests that still need approval by a finance officer different from you. Costs already released cannot be refunded from escrow.</Notice>
          <form action={disputeDecideAction} className="mt-3 grid gap-2 sm:grid-cols-3"><input type="hidden" name="id" value={id} />
            <select name="outcome" className="input"><option value="RELEASE_TO_SELLER">Release to seller (no refund)</option><option value="PARTIAL_REFUND">Partial refund</option><option value="FULL_REFUND">Full refund of unreleased funds</option><option value="REMEDIATION">Remediation by seller</option><option value="NO_ACTION">No action</option></select>
            <input name="refundAmount" className="input" placeholder="Partial refund amount (₦)" />
            <textarea name="notes" className="input sm:col-span-3" required minLength={20} placeholder="Documented reasoning (shared with both parties)" />
            <button className="btn-primary btn-sm w-fit">Issue decision</button>
          </form>
        </Card>
      ) : <Notice>A manager with dispute decision rights must issue the decision.</Notice>) : d.outcome && <Card title="Decision"><p className="text-sm">{d.outcome.replace(/_/g, " ").toLowerCase()} {d.refundAmount && `— refund ${formatMoney(d.refundAmount)}`}</p><p className="text-sm text-slate-600">{d.decisionNotes}</p></Card>}
    </div>
  );
}
