import type { DisputeCategory, DisputeOutcome } from "@prisma/client";
import { prisma, transaction } from "@/server/db";
import { newDisputeRef } from "@/lib/ids";
import { D, type Dec, formatMoney } from "@/lib/money";
import { forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify, notifyRole } from "@/server/notifications/notify";
import { getConfig } from "@/server/admin/config";
import { freezeOrderFunds, unfreezeOrderFunds } from "@/server/settlement/settlement";
import { refundableBalance } from "@/server/payments/refunds";

export const CATEGORY_LABEL: Record<DisputeCategory, string> = {
  VEHICLE_NOT_PURCHASED: "Vehicle not purchased",
  INCORRECT_VEHICLE_OR_VIN: "Incorrect vehicle or VIN",
  UNDISCLOSED_DAMAGE: "Materially undisclosed damage",
  MISSING_DOCUMENTATION: "Missing documentation",
  SHIPPING_DELAY: "Shipping delay beyond contractual threshold",
  UNEXPECTED_CHARGES: "Unexpected charges",
  VEHICLE_NOT_DELIVERED: "Vehicle not delivered",
  DELIVERY_CONDITION: "Condition on delivery",
  DEALER_CANCELLATION: "Dealer cancellation",
  SUPPLIER_FAILURE: "Supplier failure",
  OTHER: "Other",
};

const OPEN_STATUSES = ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"] as const;

export async function raiseDispute(actor: Actor, input: { orderId: string; category: DisputeCategory; description: string; documentId?: string }) {
  if (input.description.trim().length < 20) throw invalid("Describe the problem in at least 20 characters.");
  return transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order || order.buyerId !== actor.userId) throw notFound("Order");
    if (["ORDER_CREATED", "COMPLIANCE_CHECK", "AWAITING_PAYMENT", "COMPLETED", "REFUNDED"].includes(order.state)) {
      throw precondition("Disputes can be raised once funds are held and before the order is completed. For other issues, contact support.");
    }
    if (input.category === "DELIVERY_CONDITION" && !["DELIVERED", "ACCEPTANCE_PERIOD"].includes(order.state)) {
      throw precondition("Delivery condition disputes must be raised during the inspection period.");
    }
    if (input.documentId) {
      const d = await tx.document.findUnique({ where: { id: input.documentId } });
      if (!d || d.orderId !== order.id) throw precondition("Evidence must belong to this order.");
    }
    const days = await getConfig("disputes.responseDays", tx);
    const dispute = await tx.dispute.create({
      data: {
        reference: newDisputeRef(), orderId: order.id, raisedById: actor.userId, category: input.category, description: input.description.trim(),
        status: order.dealerOrgId ? "AWAITING_RESPONSE" : "OPEN", responseDueAt: new Date(Date.now() + days * 86400_000),
        evidence: { create: { submittedById: actor.userId, partyRole: "BUYER", note: input.description.trim(), documentId: input.documentId } },
      },
    });
    await freezeOrderFunds(tx, order.id, `Dispute ${dispute.reference}`);
    await audit(tx, { actor, action: "dispute.opened", entityType: "Dispute", entityId: dispute.id, summary: `${CATEGORY_LABEL[input.category]} on ${order.orderNumber}; eligible unreleased funds frozen` });
    const vars = { reference: dispute.reference, orderNumber: order.orderNumber, category: CATEGORY_LABEL[input.category] };
    await notify(tx, { userId: actor.userId, templateKey: "dispute.opened", dedupeKey: `dispute:${dispute.id}:opened`, vars, link: `/account/orders/${order.id}` });
    if (order.dealerOrgId) {
      const members = await tx.dealerMember.findMany({ where: { orgId: order.dealerOrgId } });
      for (const m of members) await notify(tx, { userId: m.userId, templateKey: "dispute.opened", dedupeKey: `dispute:${dispute.id}:opened:${m.userId}`, vars, link: `/dealer/disputes` });
    }
    await notifyRole(tx, "SUPPORT", { templateKey: "dispute.opened", dedupeKey: `dispute:${dispute.id}:staff`, vars });
    return dispute;
  });
}

async function disputeParty(actor: Actor, disputeId: string) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { order: true } });
  if (!d) throw notFound("Dispute");
  if (d.order.buyerId === actor.userId) return { d, role: "BUYER" };
  if (d.order.dealerOrgId && actor.dealerOrgIds.includes(d.order.dealerOrgId)) return { d, role: "DEALER" };
  if (can(actor, "dispute.manage")) return { d, role: "STAFF" };
  throw notFound("Dispute");
}

export async function addDisputeEvidence(actor: Actor, disputeId: string, note: string, documentId?: string) {
  const { d, role } = await disputeParty(actor, disputeId);
  if (!OPEN_STATUSES.includes(d.status as never)) throw precondition("This dispute is no longer accepting evidence.");
  if (note.trim().length < 3) throw invalid("Add a note.");
  if (documentId) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc || doc.orderId !== d.orderId) throw precondition("Evidence must belong to this order.");
  }
  await prisma.disputeEvidence.create({ data: { disputeId, submittedById: actor.userId, partyRole: role, note: note.trim(), documentId } });
  if (role === "DEALER" && d.status === "AWAITING_RESPONSE") await prisma.dispute.update({ where: { id: disputeId }, data: { status: "UNDER_INVESTIGATION" } });
  await audit(prisma, { actor, action: "dispute.evidence_added", entityType: "Dispute", entityId: disputeId, summary: `${role} added evidence` });
}

export async function assignDispute(actor: Actor, disputeId: string) {
  requirePermission(actor, "dispute.manage");
  await prisma.dispute.update({ where: { id: disputeId }, data: { assignedToId: actor.userId, status: "UNDER_INVESTIGATION" } });
  await audit(prisma, { actor, action: "dispute.assigned", entityType: "Dispute", entityId: disputeId, summary: "Investigation started" });
}

/**
 * Issue a documented decision. Refund outcomes create refund REQUESTS that still require finance dual approval;
 * nothing is paid out automatically. Funds are unfrozen only when no other freezing dispute remains.
 */
export async function decideDispute(actor: Actor, disputeId: string, input: { outcome: DisputeOutcome; notes: string; refundAmount?: string }) {
  requirePermission(actor, "dispute.decide");
  if (input.notes.trim().length < 20) throw invalid("Document the reasoning for the decision (at least 20 characters).");
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { order: true } });
  if (!dispute) throw notFound("Dispute");
  if (!OPEN_STATUSES.includes(dispute.status as never)) throw precondition("Dispute already decided.");
  if (dispute.order.buyerId === actor.userId) throw forbidden();
  let refundAmount: Dec | null = null;
  if (input.outcome === "FULL_REFUND" || input.outcome === "PARTIAL_REFUND") {
    const available = await refundableBalance(dispute.orderId, dispute.order.currency);
    refundAmount = input.outcome === "FULL_REFUND" ? available : new D(input.refundAmount ?? "0");
    if (!refundAmount.gt(0)) throw invalid("Refund amount must be positive.");
    if (refundAmount.gt(available)) throw precondition(`Refund exceeds unreleased funds held (${formatMoney(available)}). Costs already released cannot be refunded from escrow.`);
  }
  await transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: "DECISION_ISSUED", outcome: input.outcome, decisionNotes: input.notes.trim(), decidedById: actor.userId, decidedAt: new Date(), refundAmount },
    });
    if (refundAmount) {
      await tx.refund.create({ data: { orderId: dispute.orderId, amount: refundAmount, currency: dispute.order.currency, reason: `Dispute ${dispute.reference}: ${input.outcome}`, disputeId, requestedById: actor.userId } });
    }
    await unfreezeOrderFunds(tx, dispute.orderId);
    if (refundAmount && input.outcome === "FULL_REFUND") {
      // Prevent any further releases on a fully refunded order.
      await tx.settlementInstruction.updateMany({ where: { orderId: dispute.orderId, status: { in: ["SCHEDULED", "ELIGIBLE"] } }, data: { status: "CANCELLED" } });
    }
    await audit(tx, { actor, action: "dispute.decided", entityType: "Dispute", entityId: disputeId, summary: `Outcome ${input.outcome}${refundAmount ? ` refund ${refundAmount.toFixed(2)}` : ""}: ${input.notes}` });
    const vars = { reference: dispute.reference, outcome: input.outcome.replace(/_/g, " ").toLowerCase(), notes: input.notes };
    await notify(tx, { userId: dispute.order.buyerId, templateKey: "dispute.decision", dedupeKey: `dispute:${disputeId}:decision`, vars, link: `/account/orders/${dispute.orderId}` });
    if (dispute.order.dealerOrgId) {
      const members = await tx.dealerMember.findMany({ where: { orgId: dispute.order.dealerOrgId } });
      for (const m of members) await notify(tx, { userId: m.userId, templateKey: "dispute.decision", dedupeKey: `dispute:${disputeId}:decision:${m.userId}`, vars, link: "/dealer/disputes" });
    }
  });
  await resumeAfterDispute(dispute.orderId, disputeId);
}

/** Acceptance is blocked while a dispute is open; once resolved, re-schedule the acceptance-period check. */
async function resumeAfterDispute(orderId: string, disputeId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state === "ACCEPTANCE_PERIOD" && order.acceptanceDeadline) {
    const { enqueueJob } = await import("@/server/jobs/queue");
    const runAt = order.acceptanceDeadline > new Date() ? order.acceptanceDeadline : new Date();
    await enqueueJob(prisma, "order.acceptanceExpiry", { orderId }, { dedupeKey: `accept-expiry:${orderId}:after:${disputeId}`, runAt });
  }
}

export async function withdrawDispute(actor: Actor, disputeId: string) {
  const d = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!d || d.raisedById !== actor.userId) throw notFound("Dispute");
  if (!OPEN_STATUSES.includes(d.status as never)) throw precondition("Dispute already closed.");
  await transaction(async (tx) => {
    await tx.dispute.update({ where: { id: disputeId }, data: { status: "WITHDRAWN" } });
    await unfreezeOrderFunds(tx, d.orderId);
    await audit(tx, { actor, action: "dispute.withdrawn", entityType: "Dispute", entityId: disputeId, summary: "Withdrawn by buyer" });
  });
  await resumeAfterDispute(d.orderId, disputeId);
}

export async function overdueDisputes() {
  return prisma.dispute.findMany({ where: { status: "AWAITING_RESPONSE", responseDueAt: { lt: new Date() } }, include: { order: true } });
}
