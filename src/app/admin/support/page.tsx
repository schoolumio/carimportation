import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Support" };

export default async function AdminSupport() {
  await requirePerm("support.manage");
  const [convos, contacts] = await Promise.all([
    prisma.supportConversation.findMany({ include: { createdBy: true }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 200 }),
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Support conversations" />
      {!convos.length ? <EmptyState title="No conversations" /> : (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Subject</th><th>Customer</th><th>Status</th><th>Priority</th><th>Updated</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{convos.map((c) => <tr key={c.id}><td><Link className="link" href={`/admin/support/${c.id}`}>{c.subject}</Link></td><td className="text-xs">{c.createdBy.email}</td><td><Badge tone={c.status === "OPEN" || c.status === "ESCALATED" ? "pending" : "neutral"}>{c.status.toLowerCase().replace("_", " ")}</Badge></td><td>{c.priority.toLowerCase()}</td><td><LocalTime iso={c.updatedAt} /></td></tr>)}</tbody></table></div>
      )}
      <div className="card card-pad"><h2 className="h2">Contact form messages</h2><ul className="mt-2 divide-y divide-slate-100 text-sm">{contacts.map((m) => <li key={m.id} className="py-2"><span className="font-medium">{m.subject}</span> — {m.name} ({m.email}) · <LocalTime iso={m.createdAt} /><p className="text-slate-600">{m.message}</p></li>)}</ul></div>
    </div>
  );
}
