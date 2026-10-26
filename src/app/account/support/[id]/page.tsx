import { notFound } from "next/navigation";
import { requireActor } from "@/server/web/session";
import { getConversation } from "@/server/support/service";
import { Card, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { replySupportAction } from "../../actions";

export default async function Conversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  let c;
  try { c = await getConversation(actor, id); } catch { notFound(); }
  return (
    <div className="space-y-4">
      <PageHeader title={c.subject} crumbs={[{ href: "/account/support", label: "Support" }]} />
      <Flash sp={sp} />
      <Card>
        <ul className="space-y-3">{c.messages.map((m) => <li key={m.id} className={`rounded-lg p-3 text-sm ${m.authorId === actor.userId ? "ml-8 bg-brand-light" : "mr-8 bg-slate-100"}`}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-xs text-slate-500">{m.authorId === actor.userId ? "You" : "Support"} · <LocalTime iso={m.createdAt} /></p></li>)}</ul>
        <form action={replySupportAction} className="mt-4 space-y-2"><input type="hidden" name="conversationId" value={id} /><textarea name="body" required className="input" /><button className="btn-primary btn-sm">Reply</button></form>
      </Card>
    </div>
  );
}
