import Link from "next/link";
import { currentActor } from "@/server/web/session";
import { Field, Flash, Notice, PageHeader, TextArea } from "@/components/ui";
import { dealerApplyAction } from "../../actions";

export const metadata = { title: "Dealer application" };

export default async function DealerApply({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await currentActor();
  return (
    <div className="container-page max-w-3xl py-10">
      <PageHeader title="Apply to sell on the marketplace" subtitle="Verified dealers and importers can list overseas vehicles, respond to sourcing requests and receive milestone-based settlements." />
      <Flash sp={sp} />
      {actor?.dealerOrgIds.length ? <Notice tone="info">You already belong to a dealer organisation. <Link className="link" href="/dealer/onboarding">Continue onboarding</Link>.</Notice> : (
        <form action={dealerApplyAction} className="space-y-6">
          {!actor && (
            <section className="card card-pad space-y-3">
              <h2 className="h2">Authorised representative</h2>
              <p className="muted">Already have an account? <Link className="link" href="/login?next=/dealers/apply">Sign in first</Link>.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name" name="fullName" required />
                <Field label="Email" name="email" type="email" required />
                <Field label="Phone" name="phone" required />
                <Field label="Password" name="password" type="password" minLength={10} required />
              </div>
            </section>
          )}
          <section className="card card-pad space-y-3">
            <h2 className="h2">Business details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Registered legal name" name="legalName" required />
              <Field label="Trading name" name="tradingName" required />
              <Field label="CAC registration number" name="registrationNumber" />
              <Field label="Tax ID (TIN)" name="taxId" />
              <Field label="Business phone" name="businessPhone" required />
              <Field label="Business email" name="businessEmail" type="email" required />
              <Field label="City" name="city" required />
              <Field label="State" name="state" />
            </div>
            <Field label="Business address" name="businessAddress" required />
            <Field label="Website" name="website" type="url" />
            <TextArea label="About your business" name="bio" />
            <TextArea label="Supplier and sourcing relationships" name="sourcingRelationships" hint="Auctions, exporters or dealerships you buy from." />
            <TextArea label="Previous trading evidence" name="tradingHistory" hint="Volumes, years trading, references. You can upload evidence after applying." />
          </section>
          <section className="card card-pad space-y-3">
            <h2 className="h2">Settlement bank account</h2>
            <p className="muted">Account ownership is verified before any payout. Account numbers are encrypted at rest.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Bank" name="bankName" />
              <Field label="Account name" name="bankAccountName" />
              <Field label="Account number (NUBAN)" name="bankAccountNumber" inputMode="numeric" pattern="\d{10}" />
            </div>
          </section>
          <button className="btn-primary">Submit application</button>
          <p className="text-xs text-slate-500">After submitting you&apos;ll upload identity, CAC registration, proof of address and bank ownership evidence. Applications are reviewed by our verification team; statuses: submitted → under review → (additional information required) → approved or rejected.</p>
        </form>
      )}
    </div>
  );
}
