import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { StateBadge } from "@/components/OrderTimeline";
import { formatMoney } from "@/lib/money";
import { LocalTime } from "@/components/LocalTime";
import { PATH_LABEL } from "@/server/orders/state-machine";

export const metadata = { title: "My orders" };

export default async function Orders() {
  const actor = await requireActor();
  const orders = await prisma.order.findMany({ where: { buyerId: actor.userId }, include: { quote: { include: { listing: true, sourcingOffer: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Orders" />
      {!orders.length ? <EmptyState title="No orders yet" action={<Link className="btn-primary" href="/vehicles">Browse vehicles</Link>} /> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Order</th><th>Vehicle</th><th>Route</th><th>Status</th><th className="text-right">Estimated total</th><th>Placed</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link className="link" href={`/account/orders/${o.id}`}>{o.orderNumber}</Link></td>
                  <td>{o.quote.listing?.title ?? o.quote.sourcingOffer?.vehicleDescription}</td>
                  <td className="text-xs">{PATH_LABEL[o.path]}</td>
                  <td><StateBadge state={o.state} /></td>
                  <td className="text-right tabular-nums">{formatMoney(o.agreedTotal, "NGN", { compact: true })}</td>
                  <td><LocalTime iso={o.createdAt} mode="date" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
