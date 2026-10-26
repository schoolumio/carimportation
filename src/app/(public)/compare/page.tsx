import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { estimateForVehicle, listingToCostInput, estimateDelivery } from "@/server/pricing/service";
import { EmptyState, PageHeader } from "@/components/ui";
import { VehicleImage } from "@/components/VehicleImage";
import { formatMoney } from "@/lib/money";
import { AVAILABILITY_LABEL } from "@/server/inventory/service";
import { COUNTRY_NAME, PROVENANCE_LABEL } from "@/lib/labels";
import { toggleCompareAction } from "../actions";

export const metadata = { title: "Compare vehicles" };

export default async function ComparePage() {
  const ids = ((await cookies()).get("av_compare")?.value ?? "").split(",").filter(Boolean);
  const listings = ids.length ? await prisma.vehicleListing.findMany({ where: { id: { in: ids }, status: "PUBLISHED" }, include: { spec: true, media: { take: 1, orderBy: { sortOrder: "asc" } }, facts: true, dealerOrg: true } }) : [];
  const rows = await Promise.all(listings.map(async (l) => {
    let total: string | null = null;
    try { total = (await estimateForVehicle(listingToCostInput(l))).total.toFixed(2); } catch { total = null; }
    const eta = await estimateDelivery(l);
    return { l, total, eta };
  }));
  return (
    <div className="container-page py-8">
      <PageHeader title="Compare vehicles" subtitle="Compare up to four vehicles side by side, including the estimated landed cost in Lagos." />
      {!rows.length ? (
        <EmptyState title="Nothing to compare yet" action={<Link href="/vehicles" className="btn-primary">Browse vehicles</Link>}>Use the “Compare” button on a vehicle page to add it here.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th className="w-40">&nbsp;</th>{rows.map(({ l }) => <th key={l.id} className="min-w-[220px]">
              <div className="aspect-[16/10] w-full overflow-hidden rounded"><VehicleImage url={l.media[0]?.url} alt={l.title} showLabel={false} /></div>
              <Link href={`/vehicles/${l.slug}`} className="mt-2 block text-sm font-semibold normal-case text-slate-900 hover:underline">{l.title}</Link>
              <form action={toggleCompareAction}><input type="hidden" name="listingId" value={l.id} /><input type="hidden" name="back" value="/compare" /><button className="mt-1 text-xs font-normal normal-case text-danger hover:underline">Remove</button></form>
            </th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {([
                ["Vehicle price", (r) => formatMoney(r.l.price, r.l.priceCurrency, { compact: true })],
                ["Estimated landed cost", (r) => (r.total ? <strong key="t">{formatMoney(r.total, "NGN", { compact: true })}</strong> : "Unavailable")],
                ["Delivery estimate", (r) => `${r.eta.minDays}–${r.eta.maxDays} days`],
                ["Availability", (r) => AVAILABILITY_LABEL[r.l.availability]],
                ["Mileage", (r) => `${r.l.mileage.toLocaleString()} ${r.l.mileageUnit} (${PROVENANCE_LABEL[r.l.facts.find((f) => f.field === "mileage")?.provenance ?? "DEALER_DECLARED"].label})`],
                ["Engine / fuel", (r) => `${r.l.spec?.engineCapacityCc ? (r.l.spec.engineCapacityCc / 1000).toFixed(1) + " L" : "—"} · ${r.l.spec?.fuelType ?? "—"}`],
                ["Transmission", (r) => r.l.spec?.transmission ?? "—"],
                ["Source", (r) => COUNTRY_NAME[r.l.sourceCountry] ?? r.l.sourceCountry],
                ["Damage disclosure", (r) => r.l.damageDisclosure ?? "—"],
                ["Seller", (r) => r.l.dealerOrg?.tradingName ?? "Platform inventory"],
              ] as [string, (r: (typeof rows)[number]) => React.ReactNode][]).map(([label, fn]) => (
                <tr key={label}><th className="bg-slate-50 normal-case">{label}</th>{rows.map((r) => <td key={r.l.id}>{fn(r)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
