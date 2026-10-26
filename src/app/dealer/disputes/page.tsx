import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { CATEGORY_LABEL } from "@/server/disputes/service";
import { Badge, Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { DISPUTE_STATUS_LABEL } from "@/lib/labels";
import { dealerDisputeAction } from "../actions";

export const metadata = { title: "Dealer disputes" };

export default async function DealerDisputes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const disputes = await prisma.dispute.findMany({ where: { order: { dealerOrgId: actor.dealerOrgIds[0] } }, include: { order: true, evidence: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-4">
      <PageHeader title="Disputes" subtitle="Respond before the deadline with evidence. Decisions are made by authorised platform staff." />
      <Flash sp={sp} />
      {!disputes.length ? <EmptyState title="No disputes" /> : disputes.map((d) => (
        <Card key={d.id} title={`${d.reference} · ${d.order.orderNumber}`} actions={<Badge tone={d.status === "AWAITING_RESPONSE" ? "danger" : "pending"}>{DISPUTE_STATUS_LABEL[d.status]}</Badge>}>
          <p className="text-sm"><strong>{CATEGORY_LABEL[d.category]}</strong> — {d.description}</p>
          <p className="text-xs text-slate-500">Response due <LocalTime iso={d.responseDueAt} /></p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">{d.evidence.map((e) => <li key={e.id}>{e.partyRole.toLowerCase()}: {e.note}</li>)}</ul>
          {d.outcome && <p className="mt-2 text-sm">Decision: {d.outcome.replace(/_/g, " ").toLowerCase()} — {d.decisionNotes}</p>}
          {["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"].includes(d.status) && (
            <form action={dealerDisputeAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="disputeId" value={d.id} /><input name="note" className="input flex-1" placeholder="Your response" required /><input type="file" name="file" className="text-xs" /><button className="btn-primary btn-sm">Respond</button></form>
          )}
        </Card>
      ))}
    </div>
  );
}
