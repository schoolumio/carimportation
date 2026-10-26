import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { can } from "@/server/auth/actor";
import { DEALER_STATUS_LABEL, REQUIRED_CHECKS, dealerMetrics } from "@/server/dealers/service";
import { signDocumentLink } from "@/server/documents/service";
import { Badge, Card, Flash, KeyValue, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { agreementAction, dealerCheckAction, dealerStatusAction } from "../../actions";

export default async function AdminDealer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requirePerm("dealer.verify");
  const org = await prisma.dealerOrganization.findUnique({ where: { id }, include: { checks: { orderBy: { checkType: "asc" } }, verifications: { orderBy: { createdAt: "desc" } }, members: { include: { user: true } }, agreements: { orderBy: { effectiveFrom: "desc" } } } });
  if (!org) notFound();
  const [m, docs] = await Promise.all([dealerMetrics(id), prisma.document.findMany({ where: { dealerOrgId: id }, orderBy: { createdAt: "desc" } })]);
  const docLink = (docId: string | null) => (docId ? signDocumentLink(docId, actor.userId) : null);
  return (
    <div className="space-y-6">
      <PageHeader title={org.tradingName} subtitle={<>{org.legalName} · <Badge>{DEALER_STATUS_LABEL[org.status]}</Badge></>} crumbs={[{ href: "/admin/dealers", label: "Dealers" }]} />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Business details">
          <KeyValue items={[["CAC number", org.registrationNumber], ["TIN", org.taxId], ["Address", `${org.businessAddress}, ${org.city}`], ["Phone / email", `${org.phone} / ${org.email}`], ["Website", org.website], ["Bank", org.bankAccountLast4 ? `${org.bankName} ${org.bankAccountName} ••••${org.bankAccountLast4}` : "—"], ["Representatives", org.members.map((x) => `${x.user.fullName} (${x.role.toLowerCase()})`).join(", ")]]} />
          <p className="mt-3 text-sm"><span className="font-semibold">Sourcing relationships:</span> {org.sourcingRelationships ?? "—"}</p>
          <p className="mt-1 text-sm"><span className="font-semibold">Trading history:</span> {org.tradingHistory ?? "—"}</p>
        </Card>
        <Card title="Status decision">
          <form action={dealerStatusAction} className="space-y-2"><input type="hidden" name="orgId" value={id} />
            <select name="status" className="input">{["UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED", "SUSPENDED"].map((s) => <option key={s} value={s}>{DEALER_STATUS_LABEL[s as keyof typeof DEALER_STATUS_LABEL]}</option>)}</select>
            <textarea name="notes" className="input" required placeholder="Reason / information requested (sent to the dealer)" />
            <button className="btn-primary btn-sm">Apply decision</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Approval requires all mandatory checks ({REQUIRED_CHECKS.join(", ").toLowerCase()}) to pass. Suspension hides all listings.</p>
          <ul className="mt-3 space-y-1 text-xs">{org.verifications.map((v) => <li key={v.id}><Badge>{DEALER_STATUS_LABEL[v.status]}</Badge> {v.notes} · <LocalTime iso={v.createdAt} /></li>)}</ul>
        </Card>
      </div>
      <Card title="Verification checks">
        <ul className="divide-y divide-slate-100">{org.checks.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>{c.checkType.replace(/_/g, " ").toLowerCase()} {REQUIRED_CHECKS.includes(c.checkType) && <span className="text-xs text-danger">required</span>} <Badge tone={c.status === "PASSED" ? "verified" : c.status === "FAILED" ? "danger" : "pending"}>{c.status.toLowerCase()}</Badge> {docLink(c.documentId) && <a className="link" href={docLink(c.documentId)!}>evidence</a>}</span>
            <form action={dealerCheckAction} className="flex gap-1"><input type="hidden" name="orgId" value={id} /><input type="hidden" name="checkType" value={c.checkType} /><input name="notes" className="input w-48" placeholder="Notes" /><button name="status" value="PASSED" className="btn-secondary btn-sm">Pass</button><button name="status" value="FAILED" className="btn-ghost btn-sm text-danger">Fail</button>{!REQUIRED_CHECKS.includes(c.checkType) && <button name="status" value="WAIVED" className="btn-ghost btn-sm">Waive</button>}</form>
          </li>
        ))}</ul>
        <p className="mt-2 text-xs text-slate-500">All documents: {docs.map((d) => <a key={d.id} className="link mr-2" href={signDocumentLink(d.id, actor.userId)}>{d.filename}</a>)}</p>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Performance">
          <KeyValue items={[["Active listings", m.activeListings], ["Completed orders", m.completed], ["Cancelled/refunded", m.cancelled], ["Response rate", m.responseRate === null ? "n/a" : `${m.responseRate}%`], ["Disputes", m.disputes], ["Upheld complaints", m.upheldComplaints]]} />
        </Card>
        <Card title="Commercial agreement">
          <ul className="mb-2 text-xs">{org.agreements.map((a) => <li key={a.id}>{a.commissionPercent.toFixed(2)}% + {a.fixedFeePerSale.toFixed(2)} · {a.subscriptionPlan ?? "no subscription"} · from <LocalTime iso={a.effectiveFrom} mode="date" />{a.effectiveTo && <> to <LocalTime iso={a.effectiveTo} mode="date" /></>}</li>)}</ul>
          {can(actor, "config.manage") && (
            <form action={agreementAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="orgId" value={id} />
              <input name="commissionPercent" className="input" placeholder="Commission %" required /><input name="fixedFeePerSale" className="input" placeholder="Fixed fee per sale (₦)" defaultValue="0" />
              <input name="subscriptionPlan" className="input" placeholder="Subscription plan" /><input name="notes" className="input" placeholder="Contract reference" />
              <button className="btn-secondary btn-sm w-fit">Save new agreement</button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
