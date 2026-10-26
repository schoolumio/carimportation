import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { Badge, Card, Field, Flash, PageHeader, TextArea } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { openSupportAction } from "../actions";

export const metadata = { title: "Support" };

export default async function Support({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const [convos, orders] = await Promise.all([
    prisma.supportConversation.findMany({ where: { createdById: actor.userId }, orderBy: { updatedAt: "desc" } }),
    prisma.order.findMany({ where: { buyerId: actor.userId }, select: { id: true, orderNumber: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Support" />
      <Flash sp={sp} />
      <Card title="Your conversations">
        {convos.length ? <ul className="divide-y divide-slate-100">{convos.map((c) => <li key={c.id} className="flex justify-between py-2 text-sm"><Link className="link" href={`/account/support/${c.id}`}>{c.subject}</Link><span className="flex items-center gap-2"><Badge tone={c.status === "PENDING_CUSTOMER" ? "pending" : "neutral"}>{c.status === "PENDING_CUSTOMER" ? "Awaiting your reply" : c.status.toLowerCase()}</Badge><LocalTime iso={c.updatedAt} /></span></li>)}</ul> : <p className="muted">No conversations yet.</p>}
      </Card>
      <form action={openSupportAction} className="card card-pad space-y-3">
        <h2 className="h2">New message</h2>
        <label className="block"><span className="label">Related order (optional)</span><select name="orderId" defaultValue={sp.orderId ?? ""} className="input"><option value="">None</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</select></label>
        <Field label="Subject" name="subject" required />
        <TextArea label="Message" name="body" required />
        <button className="btn-primary">Send</button>
      </form>
    </div>
  );
}
