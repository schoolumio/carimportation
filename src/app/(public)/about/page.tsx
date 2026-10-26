import { brand } from "@/config/brand";
import { Field, Flash, PageHeader, TextArea } from "@/components/ui";
import { contactAction } from "../actions";

export const metadata = { title: "About & contact" };

export default async function About({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader title={`About ${brand.name}`} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="prose-legal">
          <p>{brand.name} helps people in Nigeria buy foreign-used vehicles that are still overseas and have them delivered to Lagos through a structured, transparent and secure importation process.</p>
          <p>We combine a marketplace of verified dealers and our own sourced inventory with itemised landed-cost quotes, milestone-based payment release through authorised partners, and evidence-backed shipment tracking.</p>
          <p>We are a coordination platform. Banking, escrow/safeguarding, shipping and customs clearing are performed by appropriately authorised partners. We do not hold ourselves out as any of these.</p>
          <p className="text-xs text-slate-500">{brand.legalEntity}. Registered business details will be published here once confirmed.</p>
          <p><strong>Support:</strong> {brand.supportEmail} · {brand.supportPhone}</p>
        </div>
        <div>
          <Flash sp={sp} />
          <form action={contactAction} className="card card-pad space-y-3">
            <h2 className="h2">Contact us</h2>
            <Field label="Name" name="name" required />
            <Field label="Email" name="email" type="email" required />
            <Field label="Subject" name="subject" required />
            <TextArea label="Message" name="message" required minLength={10} />
            <button className="btn-primary">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
