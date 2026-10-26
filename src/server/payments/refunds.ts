// Refunds: maker-checker. Only unreleased buyer funds held for the order can be refunded through the
// provider; costs already irreversibly incurred (released settlements) are not refundable from escrow.
import { prisma, transaction } from "@/server/db";
import { D, dec } from "@/lib/money";
import { forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { ACCOUNTS, orderHeldBalance, post } from "@/server/ledger/ledger";
import { providerFor } from "./registry";
import { notify } from "@/server/notifications/notify";
import { formatMoney } from "@/lib/money";
import { applyTransition } from "@/server/orders/engine";

export async function refundableBalance(orderId: string, currency: string, db = prisma) {
  const held = await orderHeldBalance(db, orderId, currency);
  const pending = await db.refund.aggregate({ where: { orderId, status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } }, _sum: { amount: true } });
  const reserved = await db.settlementInstruction.aggregate({ where: { orderId, status: "APPROVAL_REQUESTED" }, _sum: { amount: true } });
  return held.minus(dec(pending._sum.amount)).minus(dec(reserved._sum.amount));
}

export async function requestRefund(actor: Actor, input: { orderId: string; amount: string; reason: string; disputeId?: string }) {
  requirePermission(actor, "refund.request");
  const amount = new D(input.amount);
  if (!amount.gt(0)) throw invalid("Refund amount must be positive.");
  if (input.reason.trim().length < 5) throw invalid("Provide a reason for the refund.");
  return transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw notFound("Order");
    const available = await refundableBalance(order.id, order.currency, tx as never);
    if (amount.gt(available)) throw precondition(`Refund exceeds unreleased funds held (${formatMoney(available, order.currency)}).`);
    const r = await tx.refund.create({ data: { orderId: order.id, amount, currency: order.currency, reason: input.reason.trim(), disputeId: input.disputeId, requestedById: actor.userId } });
    await audit(tx, { actor, action: "refund.requested", entityType: "Refund", entityId: r.id, summary: `Refund requested ${amount.toFixed(2)} ${order.currency}: ${input.reason}` });
    await notify(tx, { userId: order.buyerId, templateKey: "refund.update", dedupeKey: `refund:${r.id}:requested`, vars: { orderNumber: order.orderNumber, amount: formatMoney(amount, order.currency), status: "under review" }, link: `/account/orders/${order.id}` });
    return r;
  });
}

export async function approveRefund(actor: Actor, refundId: string, opts: { externalRef?: string } = {}) {
  requirePermission(actor, "refund.approve");
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Refund" WHERE id = ${refundId} FOR UPDATE`;
    const r = await tx.refund.findUnique({ where: { id: refundId }, include: { order: { include: { escrow: true } } } });
    if (!r) throw notFound("Refund");
    if (r.status !== "REQUESTED") throw precondition("Refund is not awaiting approval.");
    if (r.requestedById === actor.userId) throw forbidden("Dual control: a different finance user must approve this refund.");
    const held = await orderHeldBalance(tx, r.orderId, r.currency);
    if (held.lt(r.amount)) throw precondition("Insufficient unreleased funds held for this refund.");
    const providerKey = r.order.escrow?.provider ?? "SANDBOX";
    const provider = providerFor(providerKey);
    const res = await provider.refund({ reference: `refund:${r.id}`, amount: r.amount, currency: r.currency, externalRef: opts.externalRef });
    await tx.providerTransaction.create({
      data: { provider: provider.key, providerTxnId: res.providerTxnId, type: "REFUND", status: res.status, amount: r.amount, currency: r.currency, reference: `refund:${r.id}`, occurredAt: new Date(), isDemo: !provider.isLive, recordedById: r.requestedById, approvedById: actor.userId },
    });
    if (res.status !== "SUCCEEDED") {
      await tx.refund.update({ where: { id: r.id }, data: { status: "FAILED", approvedById: actor.userId, approvedAt: new Date(), failureReason: `Provider status ${res.status}` } });
      return tx.refund.findUniqueOrThrow({ where: { id: r.id } });
    }
    const { transaction: ltx } = await post(tx, {
      reference: `refund:${r.id}`, kind: "REFUND", description: `Refund to buyer: ${r.reason}`, orderId: r.orderId, createdById: actor.userId, isDemo: r.order.isDemo,
      entries: [
        { account: ACCOUNTS.buyerFundsHeld(r.orderId, r.currency), direction: "DEBIT", amount: r.amount },
        { account: ACCOUNTS.safeguarded(provider.key, r.currency), direction: "CREDIT", amount: r.amount },
      ],
    });
    const updated = await tx.refund.update({ where: { id: r.id }, data: { status: "COMPLETED", approvedById: actor.userId, approvedAt: new Date(), providerTxnId: res.providerTxnId, ledgerTxnId: ltx.id } });
    // Settlement instructions can no longer be funded beyond what remains held: cancel unreleased ones when nothing is left.
    const remaining = await orderHeldBalance(tx, r.orderId, r.currency);
    if (remaining.isZero()) {
      await tx.settlementInstruction.updateMany({ where: { orderId: r.orderId, status: { notIn: ["RELEASED", "CANCELLED"] } }, data: { status: "CANCELLED" } });
    }
    await audit(tx, { actor, action: "refund.completed", entityType: "Refund", entityId: r.id, summary: `Refunded ${r.amount.toFixed(2)} ${r.currency} via ${provider.key}` });
    await notify(tx, { userId: r.order.buyerId, templateKey: "refund.update", dedupeKey: `refund:${r.id}:completed`, vars: { orderNumber: r.order.orderNumber, amount: formatMoney(r.amount, r.currency), status: "completed" }, link: `/account/orders/${r.orderId}` });
    if (r.order.state === "CANCELLED" && remaining.isZero()) {
      await applyTransition(tx, { kind: "system", reason: "refund-completed" }, r.orderId, { to: "REFUNDED" });
    }
    return updated;
  });
}

export async function rejectRefund(actor: Actor, refundId: string, reason: string) {
  requirePermission(actor, "refund.approve");
  const r = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!r || r.status !== "REQUESTED") throw precondition("Refund is not awaiting approval.");
  await prisma.refund.update({ where: { id: refundId }, data: { status: "REJECTED", approvedById: actor.userId, approvedAt: new Date(), failureReason: reason } });
  await audit(prisma, { actor, action: "refund.rejected", entityType: "Refund", entityId: refundId, summary: `Refund rejected: ${reason}` });
}
