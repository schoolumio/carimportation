import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { Badge, Card, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Notifications & jobs" };

export default async function NotificationsAdmin() {
  await requirePerm("config.manage");
  const [jobs, deliveries, counts] = await Promise.all([
    prisma.job.findMany({ where: { status: { in: ["PENDING", "FAILED", "DEAD", "RUNNING"] } }, orderBy: { runAt: "asc" }, take: 50 }),
    prisma.notificationDelivery.findMany({ include: { notification: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.groupBy({ by: ["channel", "status"], _count: { _all: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications & background jobs" subtitle="Deliveries are queued, retried with exponential backoff and logged per attempt. Run the worker with `npm run worker`." />
      <Card title="Notification totals"><div className="flex flex-wrap gap-2">{counts.map((c) => <Badge key={c.channel + c.status} tone={c.status === "SENT" ? "verified" : c.status === "FAILED" ? "danger" : "neutral"}>{c.channel} {c.status.toLowerCase()}: {c._count._all}</Badge>)}</div></Card>
      <Card title="Queued / failing jobs">
        {!jobs.length ? <p className="muted">Queue is empty.</p> : <table className="table"><thead><tr><th>Type</th><th>Status</th><th>Attempts</th><th>Run at</th><th>Last error</th></tr></thead><tbody className="divide-y divide-slate-100">{jobs.map((j) => <tr key={j.id}><td>{j.type}</td><td><Badge tone={j.status === "DEAD" ? "danger" : j.status === "FAILED" ? "pending" : "neutral"}>{j.status.toLowerCase()}</Badge></td><td>{j.attempts}/{j.maxAttempts}</td><td><LocalTime iso={j.runAt} /></td><td className="text-xs">{j.lastError}</td></tr>)}</tbody></table>}
      </Card>
      <Card title="Delivery log">
        <ul className="space-y-1 text-xs">{deliveries.map((d) => <li key={d.id}><Badge tone={d.success ? "verified" : "danger"}>{d.success ? "sent" : "failed"}</Badge> {d.notification.channel} · attempt {d.attempt} · {d.notification.subject} {d.error && `· ${d.error}`} · <LocalTime iso={d.createdAt} /></li>)}</ul>
      </Card>
    </div>
  );
}
