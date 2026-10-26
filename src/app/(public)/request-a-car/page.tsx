import { prisma } from "@/server/db";
import { currentActor } from "@/server/web/session";
import { Field, Flash, PageHeader, TextArea } from "@/components/ui";
import { sourcingAction } from "../actions";

export const metadata = { title: "Request a car" };

export default async function RequestCar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await currentActor();
  const countries = await prisma.sourceCountry.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Request a car" subtitle="Tell us what you want. Verified dealers or our sourcing team will send offers with a sourcing quote and estimated landed cost." />
      <Flash sp={sp} />
      <form action={sourcingAction} className="card card-pad space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Your name" name="contactName" defaultValue={actor?.fullName} required />
          <Field label="Email" name="contactEmail" type="email" defaultValue={actor?.email} required />
          <Field label="Phone" name="contactPhone" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Make" name="make" required placeholder="Toyota" />
          <Field label="Model" name="model" required placeholder="Land Cruiser Prado" />
          <Field label="Year from" name="yearMin" type="number" required defaultValue="2017" />
          <Field label="Year to" name="yearMax" type="number" required defaultValue="2021" />
          <Field label="Trim (optional)" name="trim" />
          <Field label="Maximum mileage (optional)" name="maxMileage" type="number" />
          <Field label="Total budget delivered to Lagos (₦)" name="budgetMax" required inputMode="numeric" hint="Your all-in budget including duties and fees." />
          <label className="block"><span className="label">Fuel</span><select name="fuelType" className="input"><option value="">Any</option><option>Petrol</option><option>Diesel</option><option>Hybrid</option></select></label>
          <label className="block"><span className="label">Transmission</span><select name="transmission" className="input"><option value="">Any</option><option>Automatic</option><option>Manual</option></select></label>
        </div>
        <fieldset><legend className="label">Preferred source countries</legend><div className="flex flex-wrap gap-3 text-sm">{countries.map((c) => <label key={c.code} className="flex items-center gap-1"><input type="checkbox" name="countries" value={c.code} /> {c.name}</label>)}</div></fieldset>
        <TextArea label="Other requirements" name="notes" placeholder="Colour, features, accident history tolerance…" />
        <button className="btn-primary">Submit request</button>
        <p className="text-xs text-slate-500">Submitting a request is free and does not commit you to buy. Offers state a vehicle price, fees, estimated shipping timeline, importation charges and total estimated landed cost.</p>
      </form>
    </div>
  );
}
