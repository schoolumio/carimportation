import Link from "next/link";
import { searchListings, makeStats, AVAILABILITY_LABEL } from "@/server/inventory/service";
import { VehicleCard } from "@/components/VehicleCard";
import { EmptyState, Flash, PageHeader } from "@/components/ui";
import { prisma } from "@/server/db";
import { COUNTRY_NAME } from "@/lib/labels";

export const metadata = { title: "Vehicle marketplace" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let result;
  try {
    result = await searchListings(sp);
  } catch {
    result = await searchListings({});
  }
  const [makes, countries] = await Promise.all([makeStats(), prisma.sourceCountry.findMany({ where: { active: true }, orderBy: { name: "asc" } })]);
  const f = result.filters;
  const qs = (page: number) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    p.set("page", String(page));
    return `/vehicles?${p.toString()}`;
  };
  return (
    <div className="container-page py-8">
      <PageHeader title="Vehicle marketplace" subtitle={`${result.total} vehicle${result.total === 1 ? "" : "s"} matching your search. Prices shown are vehicle prices; open a listing to see the full estimated cost to Lagos.`} />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside>
          <form className="card card-pad space-y-3 text-sm" aria-label="Filters">
            <label className="block"><span className="label">Keyword</span><input name="q" defaultValue={f.q} className="input" placeholder="e.g. Highlander" /></label>
            <label className="block"><span className="label">Make</span>
              <select name="make" defaultValue={f.make ?? ""} className="input"><option value="">Any make</option>{makes.map((m) => <option key={m.make} value={m.make}>{m.make} ({m.count})</option>)}</select>
            </label>
            <label className="block"><span className="label">Model</span><input name="model" defaultValue={f.model} className="input" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="label">Year from</span><input name="yearMin" type="number" defaultValue={f.yearMin} className="input" min={1990} /></label>
              <label className="block"><span className="label">Year to</span><input name="yearMax" type="number" defaultValue={f.yearMax} className="input" min={1990} /></label>
            </div>
            <label className="block"><span className="label">Max mileage</span><input name="mileageMax" type="number" defaultValue={f.mileageMax} className="input" /></label>
            <label className="block"><span className="label">Max price (₦, NGN-priced listings)</span><input name="priceMax" type="number" defaultValue={f.priceMax} className="input" /></label>
            <label className="block"><span className="label">Transmission</span><select name="transmission" defaultValue={f.transmission ?? ""} className="input"><option value="">Any</option><option>Automatic</option><option>Manual</option></select></label>
            <label className="block"><span className="label">Fuel</span><select name="fuelType" defaultValue={f.fuelType ?? ""} className="input"><option value="">Any</option><option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option></select></label>
            <label className="block"><span className="label">Body style</span><select name="bodyStyle" defaultValue={f.bodyStyle ?? ""} className="input"><option value="">Any</option><option>Sedan</option><option>SUV</option><option>Minivan</option><option>Hatchback</option><option>Pickup</option><option>Coupe</option></select></label>
            <label className="block"><span className="label">Source country</span><select name="sourceCountry" defaultValue={f.sourceCountry ?? ""} className="input"><option value="">Any</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label className="block"><span className="label">Availability</span><select name="availability" defaultValue={f.availability ?? ""} className="input"><option value="">Any</option>{Object.entries(AVAILABILITY_LABEL).filter(([k]) => !["SOLD"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block"><span className="label">Sort</span><select name="sort" defaultValue={f.sort} className="input"><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="year_desc">Newest model year</option><option value="mileage_asc">Lowest mileage</option></select></label>
            <div className="flex gap-2 pt-1"><button className="btn-primary flex-1">Apply</button><Link href="/vehicles" className="btn-secondary">Reset</Link></div>
          </form>
          <p className="mt-3 text-xs text-slate-500">Can&apos;t find it? <Link href="/request-a-car" className="link">Request a car</Link> and verified dealers will send offers.</p>
        </aside>
        <div>
          {result.items.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{result.items.map((l) => <VehicleCard key={l.id} l={l} />)}</div>
          ) : (
            <EmptyState title="No vehicles match these filters" action={<Link href="/request-a-car" className="btn-primary">Request this car</Link>}>
              Try widening the year range or removing a filter. Source countries currently served: {countries.map((c) => COUNTRY_NAME[c.code] ?? c.name).join(", ")}.
            </EmptyState>
          )}
          {result.pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
              {result.page > 1 && <Link href={qs(result.page - 1)} className="btn-secondary btn-sm">Previous</Link>}
              <span className="text-sm text-slate-600">Page {result.page} of {result.pages}</span>
              {result.page < result.pages && <Link href={qs(result.page + 1)} className="btn-secondary btn-sm">Next</Link>}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
