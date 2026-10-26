import { prisma } from "@/server/db";
import { requireActor } from "@/server/web/session";
import { dealerAvailableBalance } from "@/server/settlement/payouts";
import { MILESTONE_LABEL } from "@/server/settlement/settlement";
import { Badge, Card, Flash, KeyValue, Notice, PageHeader, Stat } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { formatMoney } from "@/lib/money";
import { SETTLEMENT_STATUS_LABEL } from "@/lib/labels";
import { payoutAction } from "../actions";

export const metadata = { title: "Dealer finance" };

export default async function DealerFinance({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const orgId = actor.dealerOrgIds[0];
  const [org, bal, settlements, payouts, agreement, commission] = await Promise.all([
    prisma.dealerOrganization.findUniqueOrThrow({ where: { id: orgId } }),
    dealerAvailableBalance(orgId),
    prisma.settlementInstruction.findMany({ where: { dealerOrgId: orgId }, include: { order: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.payout.findMany({ where: { dealerOrgId: orgId }, orderBy: { createdAt: "desc" } }),
    prisma.dealerCommercialAgreement.findFirst({ where: { orgId, effectiveTo: null }, orderBy: { effectiveFrom: "desc" } }),
    prisma.settlementInstruction.findMany({ where: { order: { dealerOrgId: orgId }, description: "Dealer commission" } }),
  ]);
  const sum = (xs: { amount: { toFixed: (n: number) => string } }[]) => xs.reduce((a, b) => a + Number(b.amount.toFixed(2)), 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Finance & settlements" />
      <Flash sp={sp} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Released to you" value={formatMoney(bal.payable.plus(0), "NGN", { compact: true })} hint="Payable balance before payouts in progress" />
        <Stat label="Available for payout" value={formatMoney(bal.available, "NGN", { compact: true })} />
        <Stat label="Held pending milestones" value={formatMoney(sum(settlements.filter((s) => ["SCHEDULED", "ELIGIBLE", "APPROVAL_REQUESTED"].includes(s.status))), "NGN", { compact: true })} />
        <Stat label="Frozen by disputes" value={formatMoney(sum(settlements.filter((s) => s.status === "BLOCKED_BY_DISPUTE")), "NGN", { compact: true })} tone="pending" />
      </div>
      <Card title="Commercial agreement">
        <KeyValue items={[["Commission on sales", agreement ? `${agreement.commissionPercent.toFixed(2)}% + ${formatMoney(agreement.fixedFeePerSale)} per sale` : "Not set"], ["Subscription plan", agreement?.subscriptionPlan ?? "None"], ["Commission charged to date", formatMoney(sum(commission))], ["Settlement account", org.bankAccountLast4 ? `${org.bankName} ••••${org.bankAccountLast4} ${org.bankAccountVerified ? "(verified)" : "(not verified)"}` : "Not provided"]]} />
      </Card>
      <Card title="Request a payout">
        {!org.bankAccountVerified ? <Notice tone="warning">Your bank account must be verified before payouts.</Notice> : (
          <form action={payoutAction} className="flex flex-wrap items-end gap-2"><label><span className="label">Amount (₦)</span><input name="amount" className="input" defaultValue={bal.available.toFixed(2)} /></label><button className="btn-primary">Request payout</button></form>
        )}
        <ul className="mt-3 space-y-1 text-sm">{payouts.map((p) => <li key={p.id}>{formatMoney(p.amount)} · <Badge tone={p.status === "PAID" ? "verified" : p.status === "REJECTED" ? "danger" : "pending"}>{p.status.toLowerCase()}</Badge> · <LocalTime iso={p.createdAt} /> {p.notes && `· ${p.notes}`}</li>)}</ul>
      </Card>
      <Card title="Settlement statement">
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>Order</th><th>Milestone</th><th>Description</th><th className="text-right">Amount</th><th>Status</th><th>Released</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{settlements.map((s) => <tr key={s.id}><td>{s.order.orderNumber}</td><td className="text-xs">{MILESTONE_LABEL[s.milestone]}</td><td>{s.description}</td><td className="text-right tabular-nums">{formatMoney(s.amount)}</td><td><Badge tone={s.status === "RELEASED" ? "verified" : "neutral"}>{SETTLEMENT_STATUS_LABEL[s.status]}</Badge></td><td>{s.releasedAt ? <LocalTime iso={s.releasedAt} mode="date" /> : "—"}</td></tr>)}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
