import { prisma, transaction } from "@/server/db";
import { D, dec } from "@/lib/money";
import { forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { ACCOUNTS, accountBalance, post } from "@/server/ledger/ledger";
import { providerFor } from "@/server/payments/registry";
import { env } from "@/config/env";

export async function dealerAvailableBalance(orgId: string, currency = "NGN") {
  const payable = await accountBalance(prisma, ACCOUNTS.dealerPayable(orgId, currency).code);
  const pending = await prisma.payout.aggregate({ where: { dealerOrgId: orgId, currency, status: { in: ["REQUESTED", "APPROVED"] } }, _sum: { amount: true } });
  return { payable, pending: dec(pending._sum.amount), available: payable.minus(dec(pending._sum.amount)) };
}

export async function requestPayout(actor: Actor, orgId: string, amountStr: string) {
  if (!actor.dealerOrgIds.includes(orgId)) throw forbidden();
  const member = await prisma.dealerMember.findUnique({ where: { orgId_userId: { orgId, userId: actor.userId } } });
  if (!member || member.role === "STAFF") throw forbidden("Only owners or managers can request payouts.");
  const org = await prisma.dealerOrganization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.status !== "APPROVED") throw precondition("Dealer must be approved to request payouts.");
  if (!org.bankAccountVerified) throw precondition("Bank account ownership must be verified before payouts.");
  const amount = new D(amountStr);
  if (!amount.gt(0)) throw invalid("Amount must be positive.");
  const bal = await dealerAvailableBalance(orgId);
  if (amount.gt(bal.available)) throw precondition("Amount exceeds available settled balance.");
  const p = await prisma.payout.create({ data: { dealerOrgId: orgId, amount, currency: "NGN", requestedById: actor.userId } });
  await audit(prisma, { actor, action: "payout.requested", entityType: "Payout", entityId: p.id, summary: `Payout requested ${amount.toFixed(2)} NGN` });
  return p;
}

export async function approvePayout(actor: Actor, payoutId: string, opts: { externalRef?: string } = {}) {
  requirePermission(actor, "payout.review");
  return transaction(async (tx) => {
    const p = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!p) throw notFound("Payout");
    if (p.status !== "REQUESTED") throw precondition("Payout is not awaiting review.");
    if (p.requestedById === actor.userId) throw forbidden("Dual control violation.");
    const payable = await accountBalance(tx, ACCOUNTS.dealerPayable(p.dealerOrgId, p.currency).code);
    if (payable.lt(p.amount)) throw precondition("Insufficient dealer payable balance.");
    const provider = providerFor(env().PAYMENT_PROVIDER === "MANUAL_PILOT" ? "MANUAL_PILOT" : "SANDBOX");
    const res = await provider.payout({ reference: `payout:${p.id}`, amount: p.amount, currency: p.currency, beneficiary: p.dealerOrgId, externalRef: opts.externalRef });
    await tx.providerTransaction.create({ data: { provider: provider.key, providerTxnId: res.providerTxnId, type: "PAYOUT", status: res.status, amount: p.amount, currency: p.currency, reference: `payout:${p.id}`, occurredAt: new Date(), isDemo: !provider.isLive } });
    const { transaction: ltx } = await post(tx, {
      reference: `payout:${p.id}`, kind: "PAYOUT", description: "Dealer payout", createdById: actor.userId, isDemo: !provider.isLive,
      entries: [
        { account: ACCOUNTS.dealerPayable(p.dealerOrgId, p.currency), direction: "DEBIT", amount: p.amount },
        { account: ACCOUNTS.safeguarded(provider.key, p.currency), direction: "CREDIT", amount: p.amount },
      ],
    });
    await audit(tx, { actor, action: "payout.paid", entityType: "Payout", entityId: p.id, summary: `Payout ${p.amount.toFixed(2)} paid via ${provider.key}` });
    return tx.payout.update({ where: { id: p.id }, data: { status: "PAID", reviewedById: actor.userId, providerTxnId: res.providerTxnId, ledgerTxnId: ltx.id } });
  });
}

export async function rejectPayout(actor: Actor, payoutId: string, notes: string) {
  requirePermission(actor, "payout.review");
  await prisma.payout.update({ where: { id: payoutId }, data: { status: "REJECTED", reviewedById: actor.userId, notes } });
  await audit(prisma, { actor, action: "payout.rejected", entityType: "Payout", entityId: payoutId, summary: `Payout rejected: ${notes}` });
}
