import { prisma } from "@/server/db";
import { estimateDelivery, estimateForVehicle, optionalServices } from "@/server/pricing/service";
import { CostBreakdown } from "@/components/CostBreakdown";
import { Notice, PageHeader } from "@/components/ui";
import { breakdownFromResult } from "@/lib/serialize";
import { D } from "@/lib/money";

export const metadata = { title: "Landed-cost calculator" };

const STAGES = [
  { v: "OVERSEAS_SUPPLIER_STOCK|AVAILABLE_FOR_PURCHASE", l: "Still with the overseas seller (not yet bought)" },
  { v: "OVERSEAS_AUCTION|AVAILABLE_FOR_PURCHASE", l: "At an overseas auction" },
  { v: "PURCHASED_OVERSEAS|PURCHASED_AWAITING_SHIPMENT", l: "Already purchased, awaiting shipment" },
  { v: "IN_TRANSIT|SHIPPED_IN_TRANSIT", l: "Already shipped (freight paid)" },
  { v: "IN_NIGERIA|ARRIVED_AWAITING_CLEARANCE", l: "At a Lagos port awaiting clearance" },
];

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string, d: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : d);
  const countries = await prisma.sourceCountry.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const fx = await prisma.exchangeRateSnapshot.findMany({ where: { quote: "NGN" }, distinct: ["base"], orderBy: { capturedAt: "desc" } });
  const opts = await optionalServices();
  const price = one("price", "15000").replace(/[,\s]/g, "");
  const currency = one("currency", "USD");
  const [listingType, availability] = one("stage", STAGES[2].v).split("|");
  const selected = ([] as string[]).concat(sp.optional ?? []);
  let result: ReturnType<typeof breakdownFromResult> | null = null;
  let error: string | null = null;
  try {
    if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0) throw new Error("Enter a valid vehicle price.");
    const r = await estimateForVehicle({
      price: new D(price), currency, sourceCountry: one("country", "US"), shippingMethod: one("method", "RORO") as never,
      engineCapacityCc: Number(one("cc", "2500")) || null, year: Number(one("year", "2019")), bodyStyle: one("body", "Sedan"),
      listingType: listingType as never, availability: availability as never, dealerFee: new D(0), auctionFeeEstimate: listingType === "OVERSEAS_AUCTION" ? new D(price).times("0.07").toDecimalPlaces(2) : null, isDealerListing: false,
    }, { selectedOptional: selected });
    const eta = await estimateDelivery({ listingType: listingType as never, availability: availability as never, sourceCountry: one("country", "US") });
    result = breakdownFromResult(r, { etaMinDays: eta.minDays, etaMaxDays: eta.maxDays });
  } catch (e) {
    error = e instanceof Error ? e.message : "Unable to calculate";
  }
  return (
    <div className="container-page py-8">
      <PageHeader title="Landed-cost calculator" subtitle="Estimate the full cost of getting a vehicle to Lagos. Every line shows its basis, who receives it and how certain it is." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <form className="card card-pad space-y-3 text-sm">
          <label className="block"><span className="label">Vehicle price</span><input name="price" defaultValue={price} className="input" inputMode="decimal" required /></label>
          <label className="block"><span className="label">Currency</span><select name="currency" defaultValue={currency} className="input">{["USD", ...fx.map((f) => f.base).filter((b) => b !== "USD"), "NGN"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="block"><span className="label">Where is the vehicle?</span><select name="stage" defaultValue={`${listingType}|${availability}`} className="input">{STAGES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label>
          <label className="block"><span className="label">Source country</span><select name="country" defaultValue={one("country", "US")} className="input">{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
          <label className="block"><span className="label">Shipping method</span><select name="method" defaultValue={one("method", "RORO")} className="input"><option value="RORO">Roll-on/roll-off (RoRo)</option><option value="CONTAINER">Container</option></select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="label">Model year</span><input name="year" type="number" defaultValue={one("year", "2019")} className="input" /></label>
            <label className="block"><span className="label">Engine (cc)</span><input name="cc" type="number" defaultValue={one("cc", "2500")} className="input" /></label>
          </div>
          <label className="block"><span className="label">Body style</span><select name="body" defaultValue={one("body", "Sedan")} className="input">{["Sedan", "SUV", "Minivan", "Hatchback", "Pickup", "Coupe"].map((b) => <option key={b}>{b}</option>)}</select></label>
          {opts.length > 0 && <fieldset className="space-y-1"><legend className="label">Optional services</legend>{opts.map((o) => <label key={o.code} className="flex items-center gap-2"><input type="checkbox" name="optional" value={o.code} defaultChecked={selected.includes(o.code)} />{o.label}</label>)}</fieldset>}
          <button className="btn-primary w-full">Calculate</button>
          <p className="text-xs text-slate-500">Exchange rates: {fx.map((f) => `${f.base} ₦${Number(f.rate).toLocaleString()}`).join(" · ")} {fx[0]?.isDemo && "(demo rates)"}</p>
        </form>
        <div className="card card-pad">
          {error ? <Notice tone="danger" title="Unable to calculate">{error}</Notice> : result && <CostBreakdown data={result} />}
          <p className="mt-4 text-xs text-slate-500">Government duties, levies and taxes are calculated from configurable, dated rules recorded by our administrators with their source. Rules marked “Unverified rate” have not yet been checked against the current official publication. This calculator is an estimate and not an offer.</p>
        </div>
      </div>
    </div>
  );
}
