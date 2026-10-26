import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { signDocumentLink } from "@/server/documents/service";
import { Badge, EmptyState, Flash, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { BENEFICIARY_LABEL } from "@/lib/labels";
import { costReviewAction } from "../actions";

export const metadata = { title: "Cost approvals" };

export default async function Costs({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requirePerm("cost.review");
  const costs = await prisma.costAdjustment.findMany({ include: { order: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title="Additional cost approvals" subtitle="Reviewers must differ from submitters. Buyers approve before being charged unless a disclosed contract clause applies." />
      <Flash sp={sp} />
      {!costs.length ? <EmptyState title="No additional costs submitted" /> : (
        <div className="space-y-3">{costs.map((c) => (
          <div key={c.id} className="card card-pad text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{c.label} · {formatMoney(c.amount)} → {BENEFICIARY_LABEL[c.beneficiary]}</span><Badge tone={c.status === "PAID" ? "verified" : c.status.startsWith("REJECTED") ? "danger" : "pending"}>{c.status.replace(/_/g, " ").toLowerCase()}</Badge></div>
            <p className="text-slate-600"><Link className="link" href={`/admin/orders/${c.orderId}`}>{c.order.orderNumber}</Link> · {c.reason} {c.contractualClause && `· clause: ${c.contractualClause}`} {c.evidenceDocumentId && <a className="link" href={signDocumentLink(c.evidenceDocumentId, actor.userId)}>evidence</a>}</p>
            {c.status === "PENDING_INTERNAL_REVIEW" && (c.submittedById === actor.userId ? <p className="text-xs text-slate-500">You submitted this — another reviewer must decide.</p> : (
              <form action={costReviewAction} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="costId" value={c.id} /><input type="hidden" name="back" value="/admin/costs" /><input name="notes" className="input w-64" placeholder="Review notes" />
                <button name="decision" value="SEND_TO_BUYER" className="btn-primary btn-sm">Send to buyer for approval</button>
                {c.contractualClause && <button name="decision" value="CONTRACTUAL_EXCEPTION" className="btn-secondary btn-sm">Apply contractual clause</button>}
                <button name="decision" value="REJECT" className="btn-ghost btn-sm text-danger">Reject</button>
              </form>
            ))}
          </div>
        ))}</div>
      )}
    </div>
  );
}
