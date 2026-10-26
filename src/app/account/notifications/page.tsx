import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { markNotificationsReadAction } from "@/app/(public)/actions";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const actor = await requireActor();
  const items = await prisma.notification.findMany({ where: { userId: actor.userId, channel: "IN_APP" }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title="Notifications" actions={<form action={markNotificationsReadAction}><button className="btn-secondary btn-sm">Mark all as read</button></form>} />
      {!items.length ? <EmptyState title="No notifications" /> : (
        <ul className="card divide-y divide-slate-100">{items.map((n) => (
          <li key={n.id} className={`p-4 text-sm ${n.readAt ? "" : "bg-brand-light/40"}`}>
            <p className="font-semibold">{n.link ? <Link className="hover:underline" href={n.link}>{n.subject}</Link> : n.subject}</p>
            <p className="text-slate-600">{n.body}</p>
            <p className="text-xs text-slate-400"><LocalTime iso={n.createdAt} /></p>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
