import { prisma } from "@/server/db";
import { getConfig } from "@/server/admin/config";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Shipping & delivery" };

export default async function Shipping() {
  const [countries, locations, stages] = await Promise.all([prisma.sourceCountry.findMany({ where: { active: true }, orderBy: { name: "asc" } }), prisma.deliveryLocation.findMany({ where: { active: true } }), getConfig("eta.stageDays")]);
  const s = stages as unknown as Record<string, readonly number[]>;
  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader title="Shipping & delivery" subtitle="Realistic, evidence-based timelines — and what can cause delays." />
      <div className="space-y-6">
        <Notice tone="info">We never promise delivery within a fixed number of days. Estimates are ranges based on operational data and are revised — with the reason shown — when new evidence arrives.</Notice>
        <Card title="Typical ocean transit to Lagos (configured operational ranges)">
          <table className="table"><thead><tr><th>Origin</th><th>Ports</th><th>Transit</th></tr></thead><tbody>
            {countries.map((c) => <tr key={c.code}><td>{c.name}</td><td>{c.originPorts.join(", ")}</td><td>{c.transitDaysMin}–{c.transitDaysMax} days</td></tr>)}
          </tbody></table>
          <p className="mt-2 text-xs text-slate-500">Ranges are not carrier guarantees. Actual sailing schedules are recorded per shipment once booked.</p>
        </Card>
        <Card title="Other stages">
          <ul className="space-y-1 text-sm">
            <li>Purchase from supplier: {s.sourcing?.[0]}–{s.sourcing?.[1]} days · auction purchase: {s.auction?.[0]}–{s.auction?.[1]} days</li>
            <li>Inspection: {s.inspection?.[0]}–{s.inspection?.[1]} days · export preparation & booking: {s.exportPrep?.[0]}–{s.exportPrep?.[1]} days</li>
            <li>Port arrival, customs clearance & release: {s.clearance?.[0]}–{s.clearance?.[1]} days · delivery within Lagos: {s.localDelivery?.[0]}–{s.localDelivery?.[1]} days</li>
          </ul>
        </Card>
        <Card title="What can cause delays">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Auction outcomes, title processing and seller document delays.</li>
            <li>Vessel schedule changes, transhipment and weather.</li>
            <li>Port congestion and terminal operations in Lagos.</li>
            <li>Customs assessment queries, physical examination and valuation disputes.</li>
            <li>Outstanding documents or payments, including approval of additional charges.</li>
          </ul>
        </Card>
        <Card title="Tracking">
          <p className="text-sm text-slate-700">Milestones are recorded by our logistics, clearing and delivery partners with supporting documents. Live vessel tracking is shown only where a carrier integration actually exists; otherwise you see verified manual updates and the time of the last update. No carrier integration is currently connected in this environment.</p>
        </Card>
        <Card title="Delivery areas">
          <ul className="text-sm">{locations.map((l) => <li key={l.code}>{l.name} — typically {l.localDeliveryDaysMin}–{l.localDeliveryDaysMax} days after release</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
