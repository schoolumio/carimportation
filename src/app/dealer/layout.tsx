import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/web/session";
import { prisma } from "@/server/db";
import { Badge } from "@/components/ui";
import { DEALER_STATUS_LABEL } from "@/server/dealers/service";

const NAV = [["/dealer", "Overview"], ["/dealer/onboarding", "Verification"], ["/dealer/listings", "Inventory"], ["/dealer/inquiries", "Inquiries"], ["/dealer/orders", "Orders"], ["/dealer/sourcing", "Sourcing requests"], ["/dealer/finance", "Finance"], ["/dealer/disputes", "Disputes"]];

export default async function DealerLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("/dealer");
  if (!actor.dealerOrgIds.length) redirect("/dealers/apply");
  const org = await prisma.dealerOrganization.findUniqueOrThrow({ where: { id: actor.dealerOrgIds[0] } });
  return (
    <div className="container-page py-8">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside>
          <p className="font-semibold">{org.tradingName}</p>
          <Badge tone={org.status === "APPROVED" ? "verified" : org.status === "SUSPENDED" || org.status === "REJECTED" ? "danger" : "pending"}>{DEALER_STATUS_LABEL[org.status]}</Badge>
          <nav className="mt-3 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Dealer">{NAV.map(([h, l]) => <Link key={h} href={h} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:text-brand">{l}</Link>)}</nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
