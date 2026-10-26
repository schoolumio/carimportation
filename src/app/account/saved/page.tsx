import Link from "next/link";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { VehicleCard } from "@/components/VehicleCard";

export const metadata = { title: "Saved vehicles" };

export default async function Saved() {
  const actor = await requireActor();
  const saved = await prisma.savedVehicle.findMany({ where: { userId: actor.userId }, include: { listing: { include: { spec: true, media: { take: 1, orderBy: { sortOrder: "asc" } }, dealerOrg: true, facts: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Saved vehicles" actions={<Link href="/compare" className="btn-secondary">Compare</Link>} />
      {!saved.length ? <EmptyState title="No saved vehicles" action={<Link className="btn-primary" href="/vehicles">Browse vehicles</Link>}>Use “Save” on a vehicle page to keep it here.</EmptyState> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{saved.map((s) => <VehicleCard key={s.listingId} l={s.listing} />)}</div>}
    </div>
  );
}
