import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { can } from "@/server/auth/actor";
import { findDuplicates, LISTING_STATUS_LABEL } from "@/server/inventory/service";
import { signDocumentLink } from "@/server/documents/service";
import { ListingForm } from "@/components/ListingForm";
import { MediaManager } from "@/components/MediaManager";
import { Badge, Card, Flash, Notice, PageHeader } from "@/components/ui";
import { PROVENANCE_LABEL } from "@/lib/labels";
import { adminSubmitListingAction, adminUpdateListingAction, docReviewAction, featureAction, flagAction, moderateAction, verifyFactAction } from "../../actions";
import { listingDocAction } from "@/app/dealer/actions";

export default async function AdminListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePerm("listing.moderate");
  const l = await prisma.vehicleListing.findUnique({ where: { id }, include: { spec: true, media: { orderBy: { sortOrder: "asc" } }, facts: true, dealerOrg: true, flags: true, inspections: true } });
  if (!l) notFound();
  const [docs, dups] = await Promise.all([prisma.document.findMany({ where: { listingId: id }, orderBy: { createdAt: "desc" } }), findDuplicates(id)]);
  const back = `/admin/listings/${id}`;
  const B = () => <input type="hidden" name="back" value={back} />;
  return (
    <div className="space-y-6">
      <PageHeader title={l.title} subtitle={<>{l.publicRef} · {l.dealerOrg ? <Link className="link" href={`/admin/dealers/${l.dealerOrgId}`}>{l.dealerOrg.tradingName}</Link> : "Platform inventory"} · <Badge>{LISTING_STATUS_LABEL[l.status]}</Badge></>} crumbs={[{ href: "/admin/listings", label: "Listings" }]} actions={<Link className="btn-secondary" href={`/vehicles/${l.slug}`}>View public page</Link>} />
      <Flash sp={sp} />
      {dups.length > 0 && <Notice tone="warning" title="Possible duplicates">{dups.map((d) => <Link key={d.id} className="link mr-2" href={`/admin/listings/${d.id}`}>{d.publicRef} {d.title}</Link>)}</Notice>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Moderation">
          <form action={moderateAction} className="space-y-2"><B /><input type="hidden" name="listingId" value={id} />
            <textarea name="notes" className="input" placeholder="Notes to the seller (required except for approval)" defaultValue={l.moderationNotes ?? ""} />
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="APPROVE" className="btn-primary btn-sm">Approve & publish</button>
              <button name="decision" value="REQUEST_CHANGES" className="btn-secondary btn-sm">Request changes</button>
              <button name="decision" value="REJECT" className="btn-secondary btn-sm">Reject</button>
              <button name="decision" value="SUSPEND" className="btn-danger btn-sm">Suspend</button>
            </div>
          </form>
          {["DRAFT", "CHANGES_REQUESTED"].includes(l.status) && !l.dealerOrgId && <form action={adminSubmitListingAction} className="mt-2"><input type="hidden" name="listingId" value={id} /><button className="btn-secondary btn-sm">Submit to moderation queue</button></form>}
          {can(actor, "listing.manage.all") && <form action={featureAction} className="mt-3"><B /><input type="hidden" name="listingId" value={id} /><input type="hidden" name="featured" value={l.featured ? "0" : "1"} /><button className="btn-ghost btn-sm">{l.featured ? "Remove featured placement" : "Feature for 14 days"}</button></form>}
          {l.flags.length > 0 && (
            <div className="mt-4"><p className="text-sm font-semibold">Flags</p>
              {l.flags.map((f) => <div key={f.id} className="mt-1 text-sm"><Badge tone={f.status === "OPEN" ? "danger" : "neutral"}>{f.kind.replace(/_/g, " ").toLowerCase()}</Badge> {f.details} {["OPEN", "INVESTIGATING"].includes(f.status) && <form action={flagAction} className="mt-1 flex gap-1"><B /><input type="hidden" name="flagId" value={f.id} /><input name="resolution" className="input" placeholder="Resolution" required /><button name="status" value="DISMISSED" className="btn-secondary btn-sm">Dismiss</button><button name="status" value="ACTIONED" className="btn-secondary btn-sm">Actioned</button></form>}</div>)}
            </div>
          )}
        </Card>
        <Card title="Fact verification (evidence required)">
          <ul className="space-y-3 text-sm">{["vin", "mileage", "condition", "ownership"].map((field) => {
            const f = l.facts.find((x) => x.field === field);
            return (
              <li key={field}>
                <p><span className="font-medium">{field}</span> <Badge tone={PROVENANCE_LABEL[f?.provenance ?? "DEALER_DECLARED"].tone}>{PROVENANCE_LABEL[f?.provenance ?? "DEALER_DECLARED"].label}</Badge></p>
                <form action={verifyFactAction} className="mt-1 flex flex-wrap gap-1"><B /><input type="hidden" name="listingId" value={id} /><input type="hidden" name="field" value={field} />
                  <select name="provenance" className="input w-auto"><option value="PLATFORM_VERIFIED">Platform verified</option><option value="INDEPENDENT_REPORT">Independent report</option><option value="DEALER_DECLARED">Seller-declared</option><option value="ESTIMATE">Estimate</option></select>
                  <select name="documentId" className="input w-auto"><option value="">No evidence</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}</select>
                  <button className="btn-secondary btn-sm">Save</button>
                </form>
              </li>
            );
          })}</ul>
        </Card>
      </div>
      <Card title="Documents">
        <ul className="divide-y divide-slate-100 text-sm">{docs.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 py-1.5"><span><a className="link" href={signDocumentLink(d.id, actor.userId)}>{d.filename}</a> <span className="text-xs text-slate-500">{d.category} · {d.visibility.toLowerCase()}</span></span>{d.reviewStatus === "PENDING" ? <form action={docReviewAction} className="flex gap-1"><B /><input type="hidden" name="documentId" value={d.id} /><button name="status" value="ACCEPTED" className="btn-secondary btn-sm">Accept</button><button name="status" value="REJECTED" className="btn-ghost btn-sm text-danger">Reject</button></form> : <Badge>{d.reviewStatus.toLowerCase()}</Badge>}</li>)}</ul>
        <form action={listingDocAction} className="mt-3 grid gap-2 sm:grid-cols-4"><input type="hidden" name="listingId" value={id} /><B />
          <select name="category" className="input"><option value="inspection-report">Inspection report</option><option value="purchase-evidence">Purchase evidence</option><option value="history-report">History report</option><option value="auction-report">Auction report</option></select>
          <input type="file" name="file" required className="text-sm" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" /> Public</label>
          <select name="inspectorType" className="input"><option value="INDEPENDENT">Independent inspector</option><option value="PLATFORM">Platform inspector</option><option value="AUCTION_HOUSE">Auction house</option></select>
          <input name="inspectorName" className="input" placeholder="Inspector name (for reports)" /><input name="grade" className="input" placeholder="Grade" /><input name="inspectedAt" type="date" className="input" />
          <input name="summary" className="input" placeholder="Summary" /><div><button className="btn-secondary btn-sm">Upload</button></div>
        </form>
      </Card>
      {(!l.dealerOrgId || can(actor, "listing.manage.all")) && <MediaManager listingId={id} media={l.media} back={back} />}
      {can(actor, "listing.manage.all") && <ListingForm action={adminUpdateListingAction} listing={l} submitLabel="Save listing" hidden={{ listingId: id }} />}
    </div>
  );
}
