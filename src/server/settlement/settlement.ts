// Contractual milestone settlement. Funds are released only when:
//  (1) the milestone was reached through a verified order transition,
//  (2) no funds-freezing dispute is open and the protected-funds reference is not frozen,
//  (3) the ledger shows sufficient buyer funds held for the order, and
//  (4) two different authorised finance users have requested and approved the release (maker-checker).
import type { Beneficiary, OrderPath, SettlementMilestone } from "@prisma/client";
import type { Tx } from "@/server/db";
import { transaction } from "@/server/db";
import { D, type Dec, ZERO, pct, round2, sum } from "@/lib/money";
import { forbidden, notFound, precondition } from "@/lib/errors";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { ACCOUNTS, orderHeldBalance, post } from "@/server/ledger/ledger";
import { providerFor } from "@/server/payments/registry";
import { CATEGORY_LABEL, type Category } from "@/server/pricing/calculator";
import { notify } from "@/server/notifications/notify";

const MILESTONE_ORDER: SettlementMilestone[] = ["PURCHASE_VERIFIED", "VEHICLE_DEPARTED", "ARRIVED_NIGERIA", "BUYER_ACCEPTED"];

export const MILESTONE_LABEL: Record<SettlementMilestone, string> = {
  PURCHASE_VERIFIED: "After verified purchase & inspection",
  VEHICLE_DEPARTED: "After verified departure",
  ARRIVED_NIGERIA: "After verified arrival in Nigeria",
  BUYER_ACCEPTED: "After delivery and buyer acceptance",
};

const PATH_MILESTONES: Record<OrderPath, SettlementMilestone[]> = {
  SOURCE_AND_IMPORT: MILESTONE_ORDER,
  AUCTION_PURCHASE: MILESTONE_ORDER,
  PURCHASED_STOCK: MILESTONE_ORDER,
  IN_TRANSIT_STOCK: ["ARRIVED_NIGERIA", "BUYER_ACCEPTED"],
  LOCAL_STOCK: ["BUYER_ACCEPTED"],
};

const CATEGORY_MILESTONE: Record<string, SettlementMilestone> = {
  ACQUISITION_FEES: "PURCHASE_VERIFIED",
  OVERSEAS_LOGISTICS: "VEHICLE_DEPARTED",
  FREIGHT: "VEHICLE_DEPARTED",
  INSURANCE: "VEHICLE_DEPARTED",
  CUSTOMS_DUTY: "ARRIVED_NIGERIA",
  LEVY: "ARRIVED_NIGERIA",
  VAT: "ARRIVED_NIGERIA",
  PORT_TERMINAL: "ARRIVED_NIGERIA",
  CLEARING: "ARRIVED_NIGERIA",
  LOCAL_DELIVERY: "BUYER_ACCEPTED",
  OPTIONAL_SERVICE: "BUYER_ACCEPTED",
  PLATFORM_FEE: "BUYER_ACCEPTED",
  PAYMENT_PROCESSING: "BUYER_ACCEPTED",
  DEALER_FEE: "BUYER_ACCEPTED",
};

/** Map a milestone that does not occur on this path to the next one that does. */
export function remapMilestone(path: OrderPath, m: SettlementMilestone): SettlementMilestone {
  const available = PATH_MILESTONES[path];
  if (available.includes(m)) return m;
  const idx = MILESTONE_ORDER.indexOf(m);
  for (let i = idx + 1; i < MILESTONE_ORDER.length; i++) if (available.includes(MILESTONE_ORDER[i])) return MILESTONE_ORDER[i];
  return "BUYER_ACCEPTED";
}

export interface PlanLine {
  category: string;
  amount: Dec;
  beneficiary: Beneficiary;
  payableStage: string;
}

export interface PlannedInstruction {
  milestone: SettlementMilestone;
  beneficiary: Beneficiary;
  dealerOrgId: string | null;
  description: string;
  amount: Dec;
}

/**
 * Pure: derive settlement instructions from the upfront quote lines.
 * The sum of instructions always equals the upfront amount collected (contingency is never settled).
 */
export function buildSettlementPlan(args: {
  path: OrderPath;
  lines: PlanLine[];
  dealerOrgId: string | null;
  vehicleReleaseOnPurchasePercent: number;
  dealerCommission?: { percent: Dec; fixed: Dec } | null;
}): PlannedInstruction[] {
  const upfront = args.lines.filter((l) => l.payableStage === "UPFRONT" && l.category !== "CONTINGENCY");
  const buckets = new Map<string, PlannedInstruction>();
  const add = (milestone: SettlementMilestone, beneficiary: Beneficiary, amount: Dec, description: string) => {
    if (amount.lte(0)) return;
    const m = remapMilestone(args.path, milestone);
    const isDealer = beneficiary === "DEALER";
    const key = `${m}:${beneficiary}:${description}`;
    const prev = buckets.get(key);
    if (prev) prev.amount = prev.amount.plus(amount);
    else buckets.set(key, { milestone: m, beneficiary, dealerOrgId: isDealer ? args.dealerOrgId : null, description, amount });
  };

  for (const l of upfront) {
    if (l.category === "VEHICLE") {
      let vehicleAmount = l.amount;
      // Platform commission on dealer sales is deducted from the dealer's proceeds — never added to the buyer's price.
      if (l.beneficiary === "DEALER" && args.dealerCommission) {
        const commission = round2(pct(l.amount, args.dealerCommission.percent).plus(args.dealerCommission.fixed));
        const capped = D.min(commission, l.amount);
        add("BUYER_ACCEPTED", "PLATFORM", capped, "Dealer commission");
        vehicleAmount = l.amount.minus(capped);
      }
      const early = round2(pct(vehicleAmount, args.vehicleReleaseOnPurchasePercent));
      add("PURCHASE_VERIFIED", l.beneficiary, early, "Vehicle price — purchase tranche");
      add("BUYER_ACCEPTED", l.beneficiary, vehicleAmount.minus(early), "Vehicle price — final tranche");
      continue;
    }
    const milestone = CATEGORY_MILESTONE[l.category] ?? "BUYER_ACCEPTED";
    add(milestone, l.beneficiary, l.amount, labelFor(l.category));
  }
  return [...buckets.values()].sort((a, b) => MILESTONE_ORDER.indexOf(a.milestone) - MILESTONE_ORDER.indexOf(b.milestone));
}

function labelFor(category: string): string {
  return CATEGORY_LABEL[category as Category] ?? category.toLowerCase().replace(/_/g, " ");
}

export async function createSettlementInstructions(tx: Tx, orderId: string, currency: string, plan: PlannedInstruction[]) {
  for (const p of plan) {
    await tx.settlementInstruction.create({
      data: { orderId, milestone: p.milestone, beneficiary: p.beneficiary, dealerOrgId: p.dealerOrgId, description: p.description, amount: p.amount, currency },
    });
  }
}

async function hasFreezingDispute(tx: Tx, orderId: string) {
  return (await tx.dispute.count({ where: { orderId, freezesFunds: true, status: { in: ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"] } } })) > 0;
}

export async function markMilestoneReached(tx: Tx, orderId: string, milestone: SettlementMilestone) {
  const frozen = await hasFreezingDispute(tx, orderId);
  const now = new Date();
  await tx.settlementInstruction.updateMany({
    where: { orderId, milestone, status: "SCHEDULED" },
    data: frozen ? { status: "BLOCKED_BY_DISPUTE", eligibleAt: now } : { status: "ELIGIBLE", eligibleAt: now },
  });
}

/** Freeze eligible, unreleased funds for an order (dispute opened). Released funds are unaffected. */
export async function freezeOrderFunds(tx: Tx, orderId: string, reason: string) {
  await tx.settlementInstruction.updateMany({
    where: { orderId, status: { in: ["ELIGIBLE", "APPROVAL_REQUESTED"] } },
    data: { status: "BLOCKED_BY_DISPUTE", requestedById: null, requestedAt: null },
  });
  const escrow = await tx.escrowReference.findUnique({ where: { orderId } });
  if (escrow && escrow.status !== "FROZEN") {
    await tx.escrowReference.update({ where: { orderId }, data: { status: "FROZEN", frozenReason: reason, notes: `previous:${escrow.status}` } });
  }
}

export async function unfreezeOrderFunds(tx: Tx, orderId: string) {
  if (await hasFreezingDispute(tx, orderId)) return;
  await tx.settlementInstruction.updateMany({ where: { orderId, status: "BLOCKED_BY_DISPUTE", eligibleAt: { not: null } }, data: { status: "ELIGIBLE" } });
  await tx.settlementInstruction.updateMany({ where: { orderId, status: "BLOCKED_BY_DISPUTE", eligibleAt: null }, data: { status: "SCHEDULED" } });
  const escrow = await tx.escrowReference.findUnique({ where: { orderId } });
  if (escrow?.status === "FROZEN") {
    const prev = escrow.notes?.startsWith("previous:") ? escrow.notes.slice(9) : "SANDBOX_SIMULATED";
    await tx.escrowReference.update({ where: { orderId }, data: { status: prev as never, frozenReason: null } });
  }
}

export async function requestRelease(actor: Actor, instructionId: string) {
  requirePermission(actor, "settlement.request");
  return transaction(async (tx) => {
    const ins = await tx.settlementInstruction.findUnique({ where: { id: instructionId } });
    if (!ins) throw notFound("Settlement instruction");
    if (ins.status !== "ELIGIBLE") throw precondition("Only eligible settlements can be submitted for approval.");
    const updated = await tx.settlementInstruction.update({ where: { id: ins.id }, data: { status: "APPROVAL_REQUESTED", requestedById: actor.userId, requestedAt: new Date() } });
    await audit(tx, { actor, action: "settlement.release_requested", entityType: "SettlementInstruction", entityId: ins.id, summary: `Release requested: ${ins.description} ${ins.amount.toFixed(2)} ${ins.currency}` });
    return updated;
  });
}

export async function approveRelease(actor: Actor, instructionId: string, opts: { externalRef?: string } = {}) {
  requirePermission(actor, "settlement.approve");
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SettlementInstruction" WHERE id = ${instructionId} FOR UPDATE`;
    const ins = await tx.settlementInstruction.findUnique({ where: { id: instructionId }, include: { order: { include: { escrow: true } } } });
    if (!ins) throw notFound("Settlement instruction");
    if (ins.status !== "APPROVAL_REQUESTED") throw precondition("Settlement is not awaiting approval.");
    if (ins.requestedById === actor.userId) throw forbidden("Dual control: the approver must be different from the requester.");
    if (await hasFreezingDispute(tx, ins.orderId)) throw precondition("Funds are frozen by an open dispute.");
    if (!ins.order.escrow || ins.order.escrow.status === "FROZEN") throw precondition("Protected-funds reference is frozen or missing.");
    const held = await orderHeldBalance(tx, ins.orderId, ins.currency);
    if (held.lt(ins.amount)) throw precondition("Insufficient buyer funds held in the ledger for this release.");

    const ccy = ins.currency;
    const credit =
      ins.beneficiary === "DEALER" && ins.dealerOrgId
        ? ACCOUNTS.dealerPayable(ins.dealerOrgId, ccy)
        : ins.beneficiary === "PLATFORM"
          ? ACCOUNTS.platformRevenue(ccy)
          : ACCOUNTS.thirdPartyPayable(ins.beneficiary, ccy);
    const { transaction: ltx } = await post(tx, {
      reference: `settlement:${ins.id}`, kind: "SETTLEMENT_RELEASE", description: `${ins.description} (${MILESTONE_LABEL[ins.milestone]})`,
      orderId: ins.orderId, createdById: actor.userId, isDemo: ins.order.isDemo,
      entries: [
        { account: ACCOUNTS.buyerFundsHeld(ins.orderId, ccy), direction: "DEBIT", amount: ins.amount },
        { account: credit, direction: "CREDIT", amount: ins.amount },
      ],
    });

    // Third-party beneficiaries (shipping, government, clearing…) are paid out immediately via the provider.
    // Dealer payables accumulate and are paid via payout requests; platform revenue stays until swept.
    let providerTxnId: string | null = null;
    if (ins.beneficiary !== "DEALER" && ins.beneficiary !== "PLATFORM") {
      const provider = providerFor(ins.order.escrow.provider);
      const res = await provider.payout({ reference: `settlement:${ins.id}`, amount: ins.amount, currency: ccy, beneficiary: ins.beneficiary, externalRef: opts.externalRef });
      providerTxnId = res.providerTxnId;
      await tx.providerTransaction.create({
        data: { provider: provider.key, providerTxnId: res.providerTxnId, type: "PAYOUT", status: res.status, amount: ins.amount, currency: ccy, reference: `settlement:${ins.id}`, occurredAt: new Date(), isDemo: !provider.isLive },
      });
      await post(tx, {
        reference: `payout:settlement:${ins.id}`, kind: "PAYOUT", description: `Payout to ${ins.beneficiary}`, orderId: ins.orderId, createdById: actor.userId, isDemo: ins.order.isDemo,
        entries: [
          { account: credit, direction: "DEBIT", amount: ins.amount },
          { account: ACCOUNTS.safeguarded(provider.key, ccy), direction: "CREDIT", amount: ins.amount },
        ],
      });
    }

    const updated = await tx.settlementInstruction.update({
      where: { id: ins.id },
      data: { status: "RELEASED", approvedById: actor.userId, releasedAt: new Date(), ledgerTxnId: ltx.id, providerTxnId },
    });
    await audit(tx, { actor, action: "settlement.released", entityType: "SettlementInstruction", entityId: ins.id, summary: `Released ${ins.amount.toFixed(2)} ${ccy} to ${ins.beneficiary}` });
    if (ins.dealerOrgId) {
      const members = await tx.dealerMember.findMany({ where: { orgId: ins.dealerOrgId } });
      for (const m of members)
        await notify(tx, { userId: m.userId, templateKey: "settlement.update", dedupeKey: `settlement:${ins.id}:released:${m.userId}`, vars: { orderNumber: ins.order.orderNumber, description: ins.description, amount: ins.amount.toFixed(2), status: "released to your payable balance" }, link: "/dealer/finance" });
    }
    // Close out orders in final settlement once nothing remains to release.
    const remaining = await tx.settlementInstruction.count({ where: { orderId: ins.orderId, status: { notIn: ["RELEASED", "CANCELLED"] } } });
    if (remaining === 0 && ins.order.state === "SETTLEMENT") {
      const { applyTransition } = await import("@/server/orders/engine");
      await applyTransition(tx, { kind: "system", reason: "settlement-complete" }, ins.orderId, { to: "COMPLETED" });
    }
    return updated;
  });
}

export function plannedTotal(plan: PlannedInstruction[]): Dec {
  return plan.length ? sum(plan.map((p) => p.amount)) : ZERO;
}
