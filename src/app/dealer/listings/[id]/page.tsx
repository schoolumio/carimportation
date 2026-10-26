import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { LISTING_STATUS_LABEL } from "@/server/inventory/service";
import { ListingForm } from "@/components/ListingForm";
import { MediaManager } from "@/components/MediaManager";
import { Badge, Card, Flash, Notice, PageHeader } from "@/components/ui";
import { PROVENANCE_LABEL } from "@/lib/labels";
import { signDocumentLink } from "@/server/documents/service";
import { listingDocAction, submitListingAction, updateListingAction } from "../../actions";

export default async function EditListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const l = await prisma.vehicleListing.findUnique({ where: { id }, include: { spec: true, media: { orderBy: { sortOrder: "asc" } }, facts: true, inspections: true } });
  if (!l || !l.dealerOrgId || !actor.dealerOrgIds.includes(l.dealerOrgId)) notFound();
  const docs = await prisma.document.findMany({ where: { listingId: id }, orderBy: { createdAt: "desc" } });
  const back = `/dealer/listings/${id}`;
  return (
    <div className="space-y-6">
      <PageHeader title={l.title} subtitle={<>{l.publicRef} · <Badge>{LISTING_STATUS_LABEL[l.status]}</Badge></>} crumbs={[{ href: "/dealer/listings", label: "Inventory" }]}
        actions={["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(l.status) ? <form action={submitListingAction}><input type="hidden" name="listingId" value={id} /><button className="btn-primary">Submit for review</button></form> : undefined} />
      <Flash sp={sp} />
      {l.moderationNotes && <Notice tone={l.status === "PUBLISHED" ? "info" : "warning"} title="Moderator notes">{l.moderationNotes}</Notice>}
      {l.status === "PUBLISHED" && <Notice>Changes to price, VIN, mileage, condition or damage disclosures send the listing back for review.</Notice>}
      <MediaManager listingId={id} media={l.media} back={back} />
      <Card title="Documents & inspections">
        <ul className="mb-3 space-y-1 text-sm">{docs.map((d) => <li key={d.id}><a className="link" href={signDocumentLink(d.id, actor.userId)}>{d.filename}</a> · {d.category} · <Badge tone={d.reviewStatus === "ACCEPTED" ? "verified" : d.reviewStatus === "REJECTED" ? "danger" : "pending"}>{d.reviewStatus.toLowerCase()}</Badge> {d.visibility === "PUBLIC_LISTING" && <Badge>public</Badge>}</li>)}</ul>
        <form action={listingDocAction} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="listingId" value={id} /><input type="hidden" name="back" value={back} />
          <select name="category" className="input"><option value="purchase-evidence">Purchase / ownership evidence</option><option value="inspection-report">Inspection report (your own)</option><option value="service-history">Service history</option><option value="export-document">Export document</option><option value="auction-report">Auction condition report</option></select>
          <input type="file" name="file" required accept="application/pdf,image/*" className="text-sm" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" /> Show on listing</label>
          <input name="inspectorName" className="input" placeholder="Inspector name (inspection reports)" />
          <input name="grade" className="input" placeholder="Grade" />
          <input name="inspectedAt" type="date" className="input" />
          <textarea name="summary" className="input sm:col-span-3" placeholder="Inspection summary" />
          <div><button className="btn-secondary btn-sm">Upload</button></div>
        </form>
        <p className="mt-2 text-xs text-slate-500">Your own inspections are labelled as the seller&apos;s inspection. Facts are marked as verified only by our staff, based on evidence.</p>
        <div className="mt-3 flex flex-wrap gap-2">{l.facts.map((f) => <Badge key={f.id} tone={PROVENANCE_LABEL[f.provenance].tone}>{f.field}: {PROVENANCE_LABEL[f.provenance].label}</Badge>)}</div>
      </Card>
      <ListingForm action={updateListingAction} listing={l} submitLabel="Save changes" hidden={{ listingId: id }} />
    </div>
  );
}
