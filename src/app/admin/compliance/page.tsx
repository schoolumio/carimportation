import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { decrypt } from "@/lib/crypto";
import { signDocumentLink } from "@/server/documents/service";
import { Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { complianceAction, identityReviewAction } from "../actions";

export const metadata = { title: "Compliance" };

export default async function Compliance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requirePerm("compliance.review");
  const [pending, checks] = await Promise.all([
    prisma.buyerProfile.findMany({ where: { identityStatus: "PENDING" }, include: { user: true }, orderBy: { updatedAt: "asc" } }),
    prisma.complianceCheck.findMany({ where: { status: "REQUIRED", type: { not: "IDENTITY" } }, include: { order: { include: { buyer: true } } } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Compliance" subtitle="Identity verification and enhanced due diligence. Decisions are audited. Confirm AML/KYC procedures with your compliance officer." />
      <Flash sp={sp} />
      <Card title="Identity verification queue">
        {!pending.length ? <EmptyState title="No pending identity submissions" /> : <ul className="divide-y divide-slate-100">{pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span><span className="font-medium">{p.user.fullName}</span> ({p.user.email}) · {p.identityType?.replace(/_/g, " ")} ending {p.identityNumberEnc ? decrypt(p.identityNumberEnc).slice(-4) : "?"} · {p.addressLine}, {p.city} · {p.identityDocumentId && <a className="link" href={signDocumentLink(p.identityDocumentId, actor.userId)}>view document</a>} · <LocalTime iso={p.updatedAt} /></span>
            <form action={identityReviewAction} className="flex gap-1"><input type="hidden" name="userId" value={p.userId} /><input name="notes" className="input w-48" placeholder="Notes" /><button name="decision" value="VERIFIED" className="btn-primary btn-sm">Verify</button><button name="decision" value="REJECTED" className="btn-ghost btn-sm text-danger">Reject</button></form>
          </li>
        ))}</ul>}
      </Card>
      <Card title="Enhanced due diligence & other checks">
        {!checks.length ? <p className="muted">No outstanding checks.</p> : <ul className="divide-y divide-slate-100">{checks.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span><Link className="link" href={`/admin/orders/${c.orderId}`}>{c.order.orderNumber}</Link> · {c.order.buyer.email} · {c.type.replace(/_/g, " ").toLowerCase()} — {c.reason}</span>
            <form action={complianceAction} className="flex gap-1"><input type="hidden" name="checkId" value={c.id} /><input type="hidden" name="back" value="/admin/compliance" /><input name="notes" className="input w-56" required placeholder="Source of funds evidence reviewed…" /><button name="decision" value="PASSED" className="btn-secondary btn-sm">Pass</button><button name="decision" value="FAILED" className="btn-ghost btn-sm text-danger">Fail</button></form>
          </li>
        ))}</ul>}
      </Card>
    </div>
  );
}
