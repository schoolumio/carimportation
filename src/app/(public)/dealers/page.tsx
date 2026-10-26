import Link from "next/link";
import { prisma } from "@/server/db";
import { dealerMetrics } from "@/server/dealers/service";
import { Badge, DemoTag, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Dealer directory" };

export default async function Dealers() {
  const dealers = await prisma.dealerOrganization.findMany({ where: { status: "APPROVED" }, orderBy: { tradingName: "asc" } });
  const metrics = await Promise.all(dealers.map((d) => dealerMetrics(d.id)));
  return (
    <div className="container-page py-10">
      <PageHeader title="Dealer directory" subtitle="Businesses that passed our identity, registration, address and bank-account checks." actions={<Link href="/dealers/apply" className="btn-primary">Become a dealer</Link>} />
      <p className="mb-6 text-sm text-slate-600">Business verification confirms who the dealer is. It does not verify individual vehicles — each listing shows separately which facts have been independently substantiated.</p>
      {!dealers.length ? <EmptyState title="No approved dealers yet" /> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dealers.map((d, i) => (
            <Link key={d.id} href={`/dealers/${d.slug}`} className="card card-pad hover:shadow-md">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">{d.tradingName}</p>{d.isDemo && <DemoTag />}</div>
              <p className="text-xs text-slate-500">{d.city}{d.state ? `, ${d.state}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-1"><Badge tone="verified">Verified business</Badge>{d.bankAccountVerified && <Badge tone="verified">Bank account verified</Badge>}</div>
              <p className="mt-3 text-sm text-slate-600 line-clamp-2">{d.bio}</p>
              <p className="mt-3 text-xs text-slate-500">{metrics[i].activeListings} active listings · {metrics[i].completed} completed orders · response rate {metrics[i].responseRate ?? "n/a"}{metrics[i].responseRate !== null ? "%" : ""}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
