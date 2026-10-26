import type { VehicleListing, VehicleSpecification } from "@prisma/client";
import { AVAILABILITY_BY_TYPE, AVAILABILITY_LABEL, LISTING_TYPE_LABEL } from "@/server/inventory/service";
import { ListingTypeFields } from "./ListingTypeFields";
import { Field, TextArea } from "./ui";

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

export function ListingForm({ action, listing, submitLabel, hidden }: { action: (fd: FormData) => Promise<void>; listing?: VehicleListing & { spec: VehicleSpecification | null }; submitLabel: string; hidden?: Record<string, string> }) {
  const l = listing;
  return (
    <form action={action} className="space-y-6">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <section className="card card-pad grid gap-3 sm:grid-cols-2">
        <h2 className="h2 sm:col-span-2">Status & source</h2>
        <ListingTypeFields types={Object.entries(LISTING_TYPE_LABEL).map(([value, label]) => ({ value, label }))} availabilityByType={AVAILABILITY_BY_TYPE} availabilityLabels={AVAILABILITY_LABEL} defaultType={l?.listingType ?? "PURCHASED_OVERSEAS"} defaultAvailability={l?.availability} />
        <Field label="Source country (ISO code)" name="sourceCountry" defaultValue={l?.sourceCountry ?? "US"} maxLength={2} required />
        <Field label="Current vehicle location" name="currentLocation" defaultValue={l?.currentLocation} required />
        <Field label="Overseas seller / auction" name="sourceName" defaultValue={l?.sourceName ?? ""} />
        <Field label="Origin port" name="originPort" defaultValue={l?.originPort ?? ""} />
        <label className="block"><span className="label">Shipping method</span><select name="shippingMethod" defaultValue={l?.shippingMethod ?? "RORO"} className="input"><option value="RORO">RoRo</option><option value="CONTAINER">Container</option><option value="LOCAL_ONLY">Local only (in Nigeria)</option></select></label>
        <div className="grid grid-cols-2 gap-2"><Field label="Shipment window from" name="shipmentWindowStart" type="date" defaultValue={d(l?.shipmentWindowStart)} /><Field label="to" name="shipmentWindowEnd" type="date" defaultValue={d(l?.shipmentWindowEnd)} /></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Est. arrival from" name="estArrivalStart" type="date" defaultValue={d(l?.estArrivalStart)} /><Field label="to" name="estArrivalEnd" type="date" defaultValue={d(l?.estArrivalEnd)} /></div>
      </section>
      <section className="card card-pad grid gap-3 sm:grid-cols-3">
        <h2 className="h2 sm:col-span-3">Vehicle</h2>
        <Field label="Make" name="make" defaultValue={l?.make} required />
        <Field label="Model" name="model" defaultValue={l?.model} required />
        <Field label="Model year" name="year" type="number" defaultValue={l?.year} required />
        <Field label="Trim" name="trim" defaultValue={l?.trim ?? ""} />
        <label className="block"><span className="label">Body style</span><select name="bodyStyle" defaultValue={l?.bodyStyle ?? "Sedan"} className="input">{["Sedan", "SUV", "Minivan", "Hatchback", "Pickup", "Coupe"].map((b) => <option key={b}>{b}</option>)}</select></label>
        <Field label="VIN / chassis number" name="vin" defaultValue={l?.vin ?? ""} hint="11–17 characters" />
        <label className="block"><span className="label">VIN visibility</span><select name="vinVisibility" defaultValue={l?.vinVisibility ?? "MASKED"} className="input"><option value="MASKED">Masked publicly</option><option value="PUBLIC">Public</option><option value="BUYERS_WITH_ORDER">Buyers with an order only</option></select></label>
        <Field label="Mileage" name="mileage" type="number" defaultValue={l?.mileage} required />
        <label className="block"><span className="label">Unit</span><select name="mileageUnit" defaultValue={l?.mileageUnit ?? "km"} className="input"><option>km</option><option>mi</option></select></label>
        <Field label="Engine capacity (cc)" name="engineCapacityCc" type="number" defaultValue={l?.spec?.engineCapacityCc ?? ""} />
        <label className="block"><span className="label">Fuel</span><select name="fuelType" defaultValue={l?.spec?.fuelType ?? "Petrol"} className="input">{["Petrol", "Diesel", "Hybrid", "Electric"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="block"><span className="label">Transmission</span><select name="transmission" defaultValue={l?.spec?.transmission ?? "Automatic"} className="input"><option>Automatic</option><option>Manual</option></select></label>
        <Field label="Drivetrain" name="drivetrain" defaultValue={l?.spec?.drivetrain ?? ""} />
        <label className="block"><span className="label">Steering</span><select name="steering" defaultValue={l?.spec?.steering ?? "LHD"} className="input"><option value="LHD">Left-hand drive</option><option value="RHD">Right-hand drive</option></select></label>
        <Field label="Exterior colour" name="exteriorColor" defaultValue={l?.spec?.exteriorColor ?? ""} />
        <Field label="Interior colour" name="interiorColor" defaultValue={l?.spec?.interiorColor ?? ""} />
        <Field label="Doors" name="doors" type="number" defaultValue={l?.spec?.doors ?? ""} />
        <Field label="Seats" name="seats" type="number" defaultValue={l?.spec?.seats ?? ""} />
      </section>
      <section className="card card-pad grid gap-3 sm:grid-cols-2">
        <h2 className="h2 sm:col-span-2">Condition & disclosures</h2>
        <p className="text-xs text-slate-500 sm:col-span-2">Everything you enter is shown as seller-declared. Undisclosed material damage is grounds for a dispute and refund.</p>
        <Field label="Condition grade" name="conditionGrade" defaultValue={l?.conditionGrade ?? ""} />
        <Field label="Previous use" name="previousUse" defaultValue={l?.previousUse ?? ""} />
        <TextArea label="Condition summary" name="conditionSummary" defaultValue={l?.conditionSummary} required />
        <TextArea label="Accident / damage disclosure" name="damageDisclosure" defaultValue={l?.damageDisclosure ?? ""} hint="Required for auction vehicles." />
        <TextArea label="Known defects" name="knownDefects" defaultValue={l?.knownDefects ?? ""} />
        <TextArea label="Required repairs" name="requiredRepairs" defaultValue={l?.requiredRepairs ?? ""} />
        <TextArea label="Ownership information" name="ownershipInfo" defaultValue={l?.ownershipInfo ?? ""} />
        <TextArea label="Additional features" name="extras" defaultValue={l?.spec?.extras ?? ""} />
      </section>
      <section className="card card-pad grid gap-3 sm:grid-cols-3">
        <h2 className="h2 sm:col-span-3">Price & terms</h2>
        <Field label="Vehicle price" name="price" defaultValue={l?.price.toFixed(2)} required inputMode="decimal" />
        <label className="block"><span className="label">Currency</span><select name="priceCurrency" defaultValue={l?.priceCurrency ?? "USD"} className="input">{["USD", "EUR", "GBP", "CAD", "AED", "NGN"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <Field label="Dealer service fee (same currency)" name="dealerFee" defaultValue={l?.dealerFee.toFixed(2) ?? "0"} hint="Shown separately to buyers. Platform commission is deducted from your proceeds, never added to the buyer's price." />
        <TextArea label="Cancellation terms" name="cancellationTerms" defaultValue={l?.cancellationTerms ?? ""} />
        <TextArea label="Warranty" name="warrantyText" defaultValue={l?.warrantyText ?? ""} />
        <TextArea label="Disclaimer" name="disclaimer" defaultValue={l?.disclaimer ?? ""} />
      </section>
      <section className="card card-pad grid gap-3 sm:grid-cols-3">
        <h2 className="h2 sm:col-span-3">Auction details (auction listings only)</h2>
        <Field label="Lot number" name="auctionLotNumber" defaultValue={l?.auctionLotNumber ?? ""} />
        <Field label="Auction date" name="auctionDate" type="date" defaultValue={d(l?.auctionDate)} />
        <Field label="Storage deadline" name="storageDeadline" type="date" defaultValue={d(l?.storageDeadline)} />
        <Field label="Auction fee estimate" name="auctionFeeEstimate" defaultValue={l?.auctionFeeEstimate?.toFixed(2) ?? ""} />
        <div className="sm:col-span-2"><TextArea label="Bidding uncertainty & authorisation conditions" name="biddingNotes" defaultValue={l?.biddingNotes ?? ""} /></div>
      </section>
      <button className="btn-primary">{submitLabel}</button>
    </form>
  );
}
