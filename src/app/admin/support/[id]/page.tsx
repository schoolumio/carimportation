import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/server/web/session";
import { getConversation } from "@/server/support/service";
import { Card, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { supportReplyAction, supportStatusAction } from "../../actions";

export default async function AdminConversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePerm("support.manage");
  let c;
  try { c = await getConversation(actor, id); } catch { notFound(); }
  return (
    <div className="space-y-4">
      <PageHeader title={c.subject} subtitle={`${c.createdBy.fullName} (${c.createdBy.email}) · ${c.status.toLowerCase()}`} crumbs={[{ href: "/admin/support", label: "Support" }]} actions={c.orderId ? <Link className="btn-secondary" href={`/admin/orders/${c.orderId}`}>Related order</Link> : undefined} />
      <Flash sp={sp} />
      <Card>
        <ul className="space-y-3">{c.messages.map((m) => <li key={m.id} className={`rounded-lg p-3 text-sm ${m.internalNote ? "border border-amber-300 bg-amber-50" : m.authorId === c.createdById ? "mr-8 bg-slate-100" : "ml-8 bg-brand-light"}`}>{m.internalNote && <p className="text-xs font-semibold text-amber-800">Internal note</p>}<p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-xs text-slate-500"><LocalTime iso={m.createdAt} /></p></li>)}</ul>
        <form action={supportReplyAction} className="mt-4 space-y-2"><input type="hidden" name="id" value={id} /><textarea name="body" required className="input" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" /> Internal note (not visible to customer)</label><button className="btn-primary btn-sm">Send</button></form>
        <form action={supportStatusAction} className="mt-3 flex gap-2"><input type="hidden" name="id" value={id} /><select name="status" className="input w-auto"><option value="OPEN">Open</option><option value="ESCALATED">Escalated</option><option value="RESOLVED">Resolved</option></select><select name="priority" className="input w-auto"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select><button className="btn-secondary btn-sm">Update</button></form>
      </Card>
    </div>
  );
}
