import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { DEALER_STATUS_LABEL, REQUIRED_CHECKS } from "@/server/dealers/service";
import { Badge, Card, Flash, Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { verificationDocAction } from "../actions";

export const metadata = { title: "Dealer verification" };

const CHECK_HELP: Record<string, string> = {
  IDENTITY: "Government ID of the authorised representative.",
  BUSINESS_REGISTRATION: "CAC certificate and status report.",
  BUSINESS_ADDRESS: "Utility bill or lease for the business address.",
  BANK_ACCOUNT_OWNERSHIP: "Bank letter or statement header showing the account is in the business name.",
  LICENSE_OR_AUTHORIZATION: "Any licences or authorisations relevant to your activities.",
  TRADING_HISTORY: "Invoices, bills of lading or references for previous imports.",
  SUPPLIER_RELATIONSHIPS: "Auction memberships or exporter agreements.",
};

export default async function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const org = await prisma.dealerOrganization.findUniqueOrThrow({ where: { id: actor.dealerOrgIds[0] }, include: { checks: { orderBy: { checkType: "asc" } }, verifications: { orderBy: { createdAt: "desc" } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Business verification" subtitle={`Status: ${DEALER_STATUS_LABEL[org.status]}`} />
      <Flash sp={sp} />
      {org.status === "ADDITIONAL_INFO_REQUIRED" && <Notice tone="warning" title="Additional information required">{org.verifications[0]?.requestedInfo}</Notice>}
      <Notice>Business verification confirms your identity and organisation. It is separate from vehicle verification, which is done per listing.</Notice>
      <Card title="Verification checks">
        <ul className="divide-y divide-slate-100">
          {org.checks.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{c.checkType.replace(/_/g, " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase())} {REQUIRED_CHECKS.includes(c.checkType) && <span className="text-xs text-danger">required</span>}</p>
                <p className="text-xs text-slate-500">{CHECK_HELP[c.checkType]}</p>
                {c.notes && <p className="text-xs text-slate-600">Reviewer: {c.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={c.status === "PASSED" ? "verified" : c.status === "FAILED" ? "danger" : c.status === "SUBMITTED" ? "pending" : "neutral"}>{c.status.replace(/_/g, " ").toLowerCase()}</Badge>
                {c.status !== "PASSED" && <form action={verificationDocAction} className="flex items-center gap-2"><input type="hidden" name="checkType" value={c.checkType} /><input type="file" name="file" required accept="application/pdf,image/*" className="w-44 text-xs" /><button className="btn-secondary btn-sm">Upload</button></form>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Review history">
        <ul className="space-y-2 text-sm">{org.verifications.map((v) => <li key={v.id}><Badge>{DEALER_STATUS_LABEL[v.status]}</Badge> {v.notes} <span className="text-xs text-slate-500">· <LocalTime iso={v.createdAt} /></span></li>)}</ul>
      </Card>
    </div>
  );
}
