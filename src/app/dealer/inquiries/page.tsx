import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { Badge, EmptyState, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { inquiryReplyAction } from "../actions";

export const metadata = { title: "Inquiries" };

export default async function Inquiries({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const items = await prisma.inquiry.findMany({ where: { dealerOrgId: actor.dealerOrgIds[0] }, include: { listing: true, buyer: { select: { fullName: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Inquiries & leads" subtitle="Buyer contact details are shared only once they place an order through the platform." />
      <Flash sp={sp} />
      {!items.length ? <EmptyState title="No inquiries yet" /> : (
        <ul className="space-y-3">{items.map((i) => (
          <li key={i.id} className="card card-pad text-sm">
            <div className="flex flex-wrap justify-between gap-2"><Link className="link" href={`/vehicles/${i.listing.slug}`}>{i.listing.title}</Link><Badge tone={i.status === "OPEN" ? "pending" : "verified"}>{i.status.toLowerCase()}</Badge></div>
            <p className="mt-1"><span className="font-medium">{i.buyer.fullName}:</span> {i.message}</p>
            <p className="text-xs text-slate-500"><LocalTime iso={i.createdAt} /></p>
            {i.response ? <p className="mt-2 rounded bg-slate-50 p-2">You replied: {i.response}</p> : (
              <form action={inquiryReplyAction} className="mt-2 flex gap-2"><input type="hidden" name="inquiryId" value={i.id} /><input name="response" required className="input" placeholder="Your reply" /><button className="btn-primary btn-sm">Reply</button></form>
            )}
          </li>
        ))}</ul>
      )}
    </div>
  );
}
