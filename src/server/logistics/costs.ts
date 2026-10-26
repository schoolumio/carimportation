// Additional costs: submitted with evidence → internal review → buyer approval (or disclosed contractual exception)
// → collected via a new payment intent → settled through escrow like other funds. Nothing is charged silently.
import type { Beneficiary } from "@prisma/client";
import { prisma, transaction, type Tx } from "@/server/db";
import { D, formatMoney } from "@/lib/money";
import { forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify, notifyRole } from "@/server/notifications/notify";
import { createPaymentIntent } from "@/server/payments/service";
import { canViewOrder } from "@/server/orders/service";

export async function submitCostAdjustment(actor: Actor, input: { orderId: string; code: string; label: string; amount: string; reason: string; beneficiary: Beneficiary; evidenceDocumentId?: string; contractualClause?: string }) {
  requirePermission(actor, "cost.submit");
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || !(await canViewOrder(actor, order))) throw notFound("Order");
  if (order.buyerId === actor.userId) throw forbidden();
  const amount = new D(input.amount);
  if (!amount.gt(0)) throw invalid("Amount must be positive.");
  if (input.reason.trim().length < 10) throw invalid("Explain why this cost arose.");
  if (!input.evidenceDocumentId) throw invalid("Supporting evidence (invoice, assessment notice) is required.");
  const doc = await prisma.document.findUnique({ where: { id: input.evidenceDocumentId } });
  if (!doc || doc.orderId !== order.id) throw precondition("Evidence must belong to this order.");
  // Prevent double charging a component already included in the quote.
  const quoted = await prisma.quoteLineItem.findFirst({ where: { quoteId: order.quoteId, code: input.code } });
  if (quoted && quoted.nature === "FIXED") throw precondition(`"${quoted.label}" was quoted as a fixed amount and cannot be charged again.`);
  const ca = await prisma.costAdjustment.create({
    data: { orderId: order.id, code: input.code, label: input.label, amount, currency: order.currency, reason: input.reason.trim(), beneficiary: input.beneficiary, evidenceDocumentId: input.evidenceDocumentId, contractualClause: input.contractualClause || null, submittedById: actor.userId },
  });
  await audit(prisma, { actor, action: "cost.submitted", entityType: "CostAdjustment", entityId: ca.id, summary: `${input.label} ${amount.toFixed(2)} submitted on ${order.orderNumber}` });
  await notifyRole(prisma, "OPERATIONS", { templateKey: "order.milestone", dedupeKey: `cost:${ca.id}:submitted`, vars: { orderNumber: order.orderNumber, milestone: "Additional cost submitted", description: `${input.label}: ${formatMoney(amount)}` } });
  return ca;
}

export async function reviewCostAdjustment(actor: Actor, id: string, decision: "SEND_TO_BUYER" | "CONTRACTUAL_EXCEPTION" | "REJECT", notes?: string) {
  requirePermission(actor, "cost.review");
  return transaction(async (tx) => {
    const ca = await tx.costAdjustment.findUnique({ where: { id }, include: { order: true } });
    if (!ca) throw notFound("Cost adjustment");
    if (ca.status !== "PENDING_INTERNAL_REVIEW") throw precondition("Already reviewed.");
    if (ca.submittedById === actor.userId) throw forbidden("The reviewer must differ from the submitter.");
    if (decision === "REJECT") {
      await tx.costAdjustment.update({ where: { id }, data: { status: "REJECTED_INTERNALLY", reviewedById: actor.userId, reviewedAt: new Date() } });
    } else if (decision === "CONTRACTUAL_EXCEPTION") {
      if (!ca.contractualClause) throw precondition("A contractual exception must cite the disclosed contract clause.");
      await tx.costAdjustment.update({ where: { id }, data: { status: "CONTRACTUAL_EXCEPTION", reviewedById: actor.userId, reviewedAt: new Date() } });
      await createPaymentIntent(tx, ca.order, { amount: ca.amount, purpose: "ADDITIONAL_COST", costAdjustmentId: ca.id });
      await notify(tx, { userId: ca.order.buyerId, templateKey: "cost.contractual_exception", dedupeKey: `cost:${id}:exception`, vars: { orderNumber: ca.order.orderNumber, label: ca.label, amount: formatMoney(ca.amount), clause: ca.contractualClause }, link: `/account/orders/${ca.orderId}` });
    } else {
      await tx.costAdjustment.update({ where: { id }, data: { status: "AWAITING_BUYER_APPROVAL", reviewedById: actor.userId, reviewedAt: new Date() } });
      await notify(tx, { userId: ca.order.buyerId, templateKey: "cost.approval_required", dedupeKey: `cost:${id}:approval`, vars: { orderNumber: ca.order.orderNumber, label: ca.label, amount: formatMoney(ca.amount), reason: ca.reason }, link: `/account/orders/${ca.orderId}` });
    }
    await audit(tx, { actor, action: "cost.reviewed", entityType: "CostAdjustment", entityId: id, summary: `${decision}${notes ? `: ${notes}` : ""}` });
  });
}

export async function buyerDecideCost(actor: Actor, id: string, approve: boolean) {
  return transaction(async (tx) => {
    const ca = await tx.costAdjustment.findUnique({ where: { id }, include: { order: true } });
    if (!ca || ca.order.buyerId !== actor.userId) throw notFound("Cost adjustment");
    if (ca.status !== "AWAITING_BUYER_APPROVAL") throw precondition("This charge is not awaiting your decision.");
    await tx.costAdjustment.update({ where: { id }, data: { status: approve ? "APPROVED_BY_BUYER" : "REJECTED_BY_BUYER", buyerDecidedAt: new Date() } });
    if (approve) await createPaymentIntent(tx, ca.order, { amount: ca.amount, purpose: "ADDITIONAL_COST", costAdjustmentId: ca.id });
    else await notifyRole(tx, "OPERATIONS", { templateKey: "order.milestone", dedupeKey: `cost:${id}:rejected`, vars: { orderNumber: ca.order.orderNumber, milestone: "Buyer rejected additional cost", description: `${ca.label}: escalate via support/dispute process.` } });
    await audit(tx, { actor, action: approve ? "cost.buyer_approved" : "cost.buyer_rejected", entityType: "CostAdjustment", entityId: id, summary: `Buyer ${approve ? "approved" : "rejected"} ${ca.label}` });
  });
}

/** Called when an additional-cost payment is confirmed: schedule settlement to the beneficiary. */
export async function onAdditionalCostPaid(tx: Tx, costAdjustmentId: string) {
  const ca = await tx.costAdjustment.findUniqueOrThrow({ where: { id: costAdjustmentId }, include: { order: true } });
  if (ca.status === "PAID") return;
  await tx.costAdjustment.update({ where: { id: ca.id }, data: { status: "PAID" } });
  const milestone = ["GOVERNMENT", "CLEARING_AGENT", "PORT_TERMINAL"].includes(ca.beneficiary) ? "ARRIVED_NIGERIA" : "BUYER_ACCEPTED";
  const reached = milestone === "ARRIVED_NIGERIA"
    ? (await tx.orderTransition.count({ where: { orderId: ca.orderId, toState: "ARRIVED_NIGERIA" } })) > 0
    : (await tx.orderTransition.count({ where: { orderId: ca.orderId, toState: "ACCEPTED" } })) > 0;
  await tx.settlementInstruction.create({
    data: {
      orderId: ca.orderId, milestone, beneficiary: ca.beneficiary, dealerOrgId: ca.beneficiary === "DEALER" ? ca.order.dealerOrgId : null,
      description: `Additional cost: ${ca.label}`, amount: ca.amount, currency: ca.currency,
      status: reached ? "ELIGIBLE" : "SCHEDULED", eligibleAt: reached ? new Date() : null,
    },
  });
}

export function canSeeCost(actor: Actor) {
  return can(actor, "cost.review");
}
