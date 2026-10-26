import Link from "next/link";
import type { OrderState, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { PageHeader, EmptyState } from "@/components/ui";
import { StateBadge } from "@/components/OrderTimeline";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { STATE_LABEL, PATH_LABEL } from "@/server/orders/state-machine";

export const metadata = { title: "Orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("order.view.all");
  const where: Prisma.OrderWhereInput = {};
  if (sp.state) where.state = sp.state as OrderState;
  if (sp.q) where.OR = [{ orderNumber: { contains: sp.q, mode: "insensitive" } }, { buyer: { email: { contains: sp.q, mode: "insensitive" } } }];
  const orders = await prisma.order.findMany({ where, include: { buyer: true, quote: { include: { listing: true, sourcingOffer: true } }, dealerOrg: true, disputes: { where: { status: { in: ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"] } } } }, orderBy: { updatedAt: "desc" }, take: 200 });
  return (
    <div>
      <PageHeader title="Orders" />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} className="input w-64" placeholder="Order number or buyer email" />
        <select name="state" defaultValue={sp.state ?? ""} className="input w-56"><option value="">All statuses</option>{Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      {!orders.length ? <EmptyState title="No orders match" /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Order</th><th>Vehicle</th><th>Buyer</th><th>Seller</th><th>Route</th><th>Status</th><th className="text-right">Value</th><th>Updated</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{orders.map((o) => (
            <tr key={o.id}>
              <td><Link className="link" href={`/admin/orders/${o.id}`}>{o.orderNumber}</Link>{o.disputes.length > 0 && <span className="ml-1 text-xs text-danger">dispute</span>}</td>
              <td>{o.quote.listing?.title ?? o.quote.sourcingOffer?.vehicleDescription}</td><td className="text-xs">{o.buyer.email}</td><td className="text-xs">{o.dealerOrg?.tradingName ?? "Platform"}</td>
              <td className="text-xs">{PATH_LABEL[o.path]}</td><td><StateBadge state={o.state} /></td><td className="text-right tabular-nums">{formatMoney(o.agreedTotal, "NGN", { compact: true })}</td><td><LocalTime iso={o.updatedAt} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
