import Link from "next/link";
import { prisma } from "@/server/db";
import { requestContext, currentActor } from "@/server/web/session";
import { rateLimit } from "@/server/auth/rate-limit";
import { JourneyProgress, StateBadge } from "@/components/OrderTimeline";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Track my car" };

export default async function Track({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await currentActor();
  let result: Awaited<ReturnType<typeof lookup>> | "notfound" | "limited" | null = null;
  if (sp.order && sp.email) {
    const ctx = await requestContext();
    result = rateLimit(`track:${ctx.ip}`, 20, 3600_000).ok ? (await lookup(sp.order, sp.email)) ?? "notfound" : "limited";
  }
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Track my car" subtitle="Check the milestone status of an order. Financial details and documents are only shown when you sign in." />
      {actor && <Notice tone="info">You&apos;re signed in — see full details in <Link className="link" href="/account/orders">My orders</Link>.</Notice>}
      <form className="card card-pad mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Order number" name="order" defaultValue={sp.order} placeholder="AV-2026-XXXXXX" required />
        <Field label="Email used for the order" name="email" type="email" defaultValue={sp.email} required />
        <button className="btn-primary">Track</button>
      </form>
      <div className="mt-6">
        {result === "notfound" && <Notice tone="warning">We couldn&apos;t find an order with that number and email.</Notice>}
        {result === "limited" && <Notice tone="danger">Too many lookups. Please try again later.</Notice>}
        {result && typeof result === "object" && (
          <Card title={<span className="flex items-center gap-2">{result.order.orderNumber} <StateBadge state={result.order.state} /></span>}>
            <JourneyProgress path={result.order.path} state={result.order.state} transitions={result.order.transitions} />
            {result.order.shipment && (
              <p className="mt-4 text-sm text-slate-600">
                {result.order.shipment.currentEtaStart && <>Current arrival estimate: <LocalTime iso={result.order.shipment.currentEtaStart} mode="date" /> – <LocalTime iso={result.order.shipment.currentEtaEnd} mode="date" />. </>}
                Last update: <LocalTime iso={result.order.shipment.lastUpdateAt ?? result.order.updatedAt} />.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

async function lookup(orderNumber: string, email: string) {
  const order = await prisma.order.findUnique({ where: { orderNumber: orderNumber.trim().toUpperCase() }, include: { buyer: true, transitions: { orderBy: { sequence: "asc" } }, shipment: true } });
  if (!order || order.buyer.email !== email.trim().toLowerCase()) return null;
  return { order };
}
