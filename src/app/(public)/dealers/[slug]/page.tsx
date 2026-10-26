import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { dealerMetrics } from "@/server/dealers/service";
import { Badge, Card, DemoTag, KeyValue, PageHeader } from "@/components/ui";
import { VehicleCard } from "@/components/VehicleCard";
import { LocalTime } from "@/components/LocalTime";

export default async function DealerProfile({ params }: { params: Promise<{ slug: string }> }) {
  const d = await prisma.dealerOrganization.findUnique({ where: { slug: (await params).slug }, include: { checks: true } });
  if (!d || d.status !== "APPROVED") notFound();
  const [m, listings] = await Promise.all([dealerMetrics(d.id), prisma.vehicleListing.findMany({ where: { dealerOrgId: d.id, status: "PUBLISHED" }, include: { spec: true, media: { take: 1, orderBy: { sortOrder: "asc" } }, dealerOrg: true, facts: true } })]);
  const passed = d.checks.filter((c) => c.status === "PASSED").map((c) => c.checkType.toLowerCase().replace(/_/g, " "));
  return (
    <div className="container-page py-10">
      <PageHeader title={d.tradingName} subtitle={<>{d.city}{d.state ? `, ${d.state}` : ""} {d.isDemo && <DemoTag />}</>} crumbs={[{ href: "/dealers", label: "Dealers" }]} />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card title="Verification">
            <div className="flex flex-wrap gap-1">{passed.map((p) => <Badge key={p} tone="verified">{p}</Badge>)}</div>
            <p className="mt-2 text-xs text-slate-500">Approved {d.approvedAt && <LocalTime iso={d.approvedAt} mode="date" />}. Identity and business verification is separate from vehicle verification.</p>
          </Card>
          <Card title="Performance (from platform records)">
            <KeyValue items={[["Active listings", m.activeListings], ["Completed orders", m.completed], ["Cancelled / refunded", m.cancelled], ["Inquiry response rate", m.responseRate === null ? "n/a" : `${m.responseRate}%`], ["Disputes raised", m.disputes], ["Complaints upheld", m.upheldComplaints]]} />
          </Card>
          {d.bio && <Card title="About"><p className="text-sm text-slate-700">{d.bio}</p></Card>}
        </div>
        <div className="grid content-start gap-5 sm:grid-cols-2">{listings.map((l) => <VehicleCard key={l.id} l={l} />)}</div>
      </div>
    </div>
  );
}
