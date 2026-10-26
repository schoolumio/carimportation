import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { Badge, EmptyState, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { flagAction } from "../actions";

export const metadata = { title: "Trust & safety" };

export default async function Flags({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("listing.moderate");
  const flags = await prisma.listingFlag.findMany({ include: { listing: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  return (
    <div>
      <PageHeader title="Trust & safety" subtitle="Fraud reports, suspected duplicates and suspicious activity." />
      <Flash sp={sp} />
      {!flags.length ? <EmptyState title="No flags" /> : <ul className="space-y-3">{flags.map((f) => (
        <li key={f.id} className="card card-pad text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={f.status === "OPEN" ? "danger" : "neutral"}>{f.status.toLowerCase()}</Badge><span className="font-medium">{f.kind.replace(/_/g, " ").toLowerCase()}</span>{f.listing && <Link className="link" href={`/admin/listings/${f.listingId}`}>{f.listing.publicRef} {f.listing.title}</Link>}<LocalTime iso={f.createdAt} /></div>
          <p className="mt-1 text-slate-600">{f.details}</p>
          {f.resolution && <p className="text-xs text-slate-500">Resolution: {f.resolution}</p>}
          {["OPEN", "INVESTIGATING"].includes(f.status) && <form action={flagAction} className="mt-2 flex gap-2"><input type="hidden" name="flagId" value={f.id} /><input name="resolution" className="input" required placeholder="Resolution" /><button name="status" value="ACTIONED" className="btn-secondary btn-sm">Actioned</button><button name="status" value="DISMISSED" className="btn-ghost btn-sm">Dismiss</button></form>}
        </li>
      ))}</ul>}
    </div>
  );
}
