// Order transition engine: the ONLY code path that changes Order.state.
import type { Order, OrderState, Prisma } from "@prisma/client";
import type { Tx } from "@/server/db";
import { transaction } from "@/server/db";
import { DomainError, forbidden, notFound, precondition } from "@/lib/errors";
import { type AnyActor, actorId, actorLabel, can } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify } from "@/server/notifications/notify";
import { enqueueJob } from "@/server/jobs/queue";
import { MILESTONE_TRIGGERS, STATE_LABEL, findTransition, type TransitionDef } from "./state-machine";
import { markMilestoneReached } from "@/server/settlement/settlement";
import { orderHeldBalance } from "@/server/ledger/ledger";

export interface TransitionInput {
  to: OrderState;
  description?: string;
  evidenceDocumentIds?: string[];
  metadata?: Record<string, unknown>;
}

async function lockOrder(tx: Tx, orderId: string): Promise<Order> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  if (!rows.length) throw notFound("Order");
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}

export async function hasOpenFreezingDispute(tx: Tx, orderId: string): Promise<boolean> {
  const n = await tx.dispute.count({ where: { orderId, freezesFunds: true, status: { in: ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"] } } });
  return n > 0;
}

/** Record-level authorisation for a performer on a specific order. */
async function performerAllowed(tx: Tx, actor: AnyActor, order: Order, def: TransitionDef): Promise<boolean> {
  if (actor.kind === "system") return def.performers.includes("SYSTEM");
  for (const p of def.performers) {
    if (p === "SYSTEM") continue;
    if (p === "BUYER_OWNER") {
      if (order.buyerId === actor.userId) return true;
      continue;
    }
    if (!can(actor, p)) continue;
    if (p === "order.transition.ops" || p === "compliance.review") return true;
    if (p === "order.transition.dealer") {
      if (order.dealerOrgId && actor.dealerOrgIds.includes(order.dealerOrgId)) return true;
      continue;
    }
    // Partner permissions are limited to shipments they are assigned to (staff ops roles hold order.transition.ops).
    const roleFor: Record<string, "LOGISTICS_OPERATOR" | "CLEARING_PARTNER" | "DELIVERY_PARTNER"> = {
      "order.transition.logistics": "LOGISTICS_OPERATOR",
      "order.transition.clearing": "CLEARING_PARTNER",
      "order.transition.delivery": "DELIVERY_PARTNER",
    };
    const role = roleFor[p];
    if (role) {
      if (can(actor, "shipment.manage")) return true;
      const assigned = await tx.shipmentAssignment.count({ where: { userId: actor.userId, role, shipment: { orderId: order.id } } });
      if (assigned > 0) return true;
    }
  }
  return false;
}

async function validateEvidence(tx: Tx, order: Order, ids: string[]) {
  if (!ids.length) return;
  const docs = await tx.document.findMany({ where: { id: { in: ids } } });
  if (docs.length !== ids.length) throw precondition("One or more evidence documents were not found.");
  for (const d of docs) {
    const shipment = d.shipmentId ? await tx.shipment.findUnique({ where: { id: d.shipmentId } }) : null;
    if (d.orderId !== order.id && shipment?.orderId !== order.id) throw precondition("Evidence documents must belong to this order.");
  }
}

/** Domain guards that must be satisfied by verifiable records, not button clicks. */
async function checkGuards(tx: Tx, order: Order, to: OrderState) {
  switch (to) {
    case "PURCHASE_AUTHORIZED": {
      const held = await orderHeldBalance(tx, order.id, order.currency);
      if (held.lt(order.payableNow)) throw precondition("Purchase cannot be authorised: ledger does not show the full upfront amount held for this order.");
      const escrow = await tx.escrowReference.findUnique({ where: { orderId: order.id } });
      if (!escrow || escrow.status === "FROZEN" || escrow.status === "NOT_ESTABLISHED") throw precondition("Purchase cannot be authorised: protected-funds reference is missing or frozen.");
      break;
    }
    case "SHIPMENT_BOOKED": {
      const s = await tx.shipment.findUnique({ where: { orderId: order.id } });
      if (!s || !(s.bookingRef || s.vesselName)) throw precondition("Record the shipment booking (booking reference or vessel) before marking it booked.");
      break;
    }
    case "DEPARTED": {
      const s = await tx.shipment.findUnique({ where: { orderId: order.id } });
      if (!s?.billOfLading && !s?.vesselName) throw precondition("Record the vessel and bill of lading before confirming departure.");
      break;
    }
    case "RELEASED_FROM_PORT": {
      const s = await tx.shipment.findUnique({ where: { orderId: order.id }, include: { customs: true } });
      if (s && s.customs && s.customs.status !== "RELEASED") throw precondition("Customs record must show the vehicle as released.");
      break;
    }
    case "DELIVERED": {
      const d = await tx.deliveryRecord.findUnique({ where: { orderId: order.id } });
      if (!d?.deliveredAt) throw precondition("Record delivery details (date, recipient, evidence) before marking delivered.");
      break;
    }
    case "ACCEPTED": {
      if (order.acceptanceDeadline && order.acceptanceDeadline < new Date()) {
        // Buyer may still accept after the deadline; system auto-acceptance is handled by the expiry job.
      }
      break;
    }
    case "COMPLETED": {
      const open = await tx.settlementInstruction.count({ where: { orderId: order.id, status: { notIn: ["RELEASED", "CANCELLED"] } } });
      if (open > 0) throw precondition("All settlement instructions must be released or cancelled before completion.");
      break;
    }
  }
}

/**
 * Apply a state transition inside an existing DB transaction.
 * Validates: definition exists for (path, from, to); performer + record-level access; evidence; guards; dispute holds.
 * Writes: immutable OrderTransition, audit event, notifications, follow-up effects.
 */
export async function applyTransition(tx: Tx, actor: AnyActor, orderId: string, input: TransitionInput): Promise<Order> {
  const order = await lockOrder(tx, orderId);
  const def = findTransition(order.path, order.state, input.to);
  if (!def) {
    throw new DomainError("INVALID_TRANSITION", `Cannot move order from "${STATE_LABEL[order.state]}" to "${STATE_LABEL[input.to]}".`);
  }
  if (!(await performerAllowed(tx, actor, order, def))) throw forbidden("You are not authorised to record this milestone for this order.");
  const evidence = input.evidenceDocumentIds ?? [];
  if (def.evidenceRequired && evidence.length === 0) throw precondition("Supporting evidence is required for this milestone.");
  await validateEvidence(tx, order, evidence);
  if (def.blockedByOpenDispute && (await hasOpenFreezingDispute(tx, order.id))) {
    throw precondition("This step is on hold while a dispute is open.");
  }
  if (input.to === "CANCELLED" && actor.kind === "user" && order.buyerId !== actor.userId && !input.description) {
    throw precondition("A cancellation reason is required.");
  }
  await checkGuards(tx, order, input.to);

  const last = await tx.orderTransition.findFirst({ where: { orderId }, orderBy: { sequence: "desc" } });
  const sequence = (last?.sequence ?? 0) + 1;
  const description = input.description?.trim() || def.label;
  await tx.orderTransition.create({
    data: {
      orderId, sequence, fromState: order.state, toState: input.to, actorId: actorId(actor), actorRole: actorLabel(actor),
      description, evidenceDocumentIds: evidence, metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  const data: Prisma.OrderUpdateInput = { state: input.to, stateVersion: { increment: 1 } };
  if (input.to === "CANCELLED") data.cancelledReason = description;
  if (input.to === "ACCEPTANCE_PERIOD") data.acceptanceDeadline = new Date(Date.now() + order.inspectionPeriodHours * 3600_000);
  const updated = await tx.order.update({ where: { id: orderId }, data });

  await audit(tx, {
    actor, action: "order.transition", entityType: "Order", entityId: orderId,
    summary: `${STATE_LABEL[order.state]} → ${STATE_LABEL[input.to]}: ${description}`,
    before: { state: order.state }, after: { state: input.to, sequence, evidence },
  });

  if (def.notifyBuyer) {
    await notify(tx, {
      userId: order.buyerId, templateKey: "order.milestone", dedupeKey: `order:${orderId}:seq:${sequence}`,
      vars: { orderNumber: order.orderNumber, milestone: STATE_LABEL[input.to], description },
      link: `/account/orders/${orderId}`,
    });
  }

  await afterTransition(tx, actor, updated, input.to);
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}

async function afterTransition(tx: Tx, actor: AnyActor, order: Order, to: OrderState) {
  // Settlement milestones become eligible only through verified state changes.
  for (const [milestone, states] of Object.entries(MILESTONE_TRIGGERS)) {
    if (states.includes(to)) await markMilestoneReached(tx, order.id, milestone as never);
  }
  // Shipment status mirrors relevant milestones.
  const shipStatus: Partial<Record<OrderState, Prisma.ShipmentUpdateInput["status"]>> = {
    SHIPMENT_BOOKED: "BOOKED", DEPARTED: "DEPARTED", IN_TRANSIT: "IN_TRANSIT", ARRIVED_NIGERIA: "ARRIVED",
    CUSTOMS_CLEARANCE: "CLEARING", RELEASED_FROM_PORT: "RELEASED", LOCAL_TRANSPORT: "DELIVERING", DELIVERED: "DELIVERED",
  };
  if (shipStatus[to]) {
    const s = await tx.shipment.findUnique({ where: { orderId: order.id } });
    if (s) {
      await tx.shipment.update({
        where: { id: s.id },
        data: {
          status: shipStatus[to], lastUpdateAt: new Date(),
          ...(to === "DEPARTED" && !s.actualDeparture ? { actualDeparture: new Date() } : {}),
          ...(to === "ARRIVED_NIGERIA" && !s.actualArrival ? { actualArrival: new Date() } : {}),
        },
      });
    }
  }
  if (to === "DELIVERED") {
    await applyTransition(tx, { kind: "system", reason: "delivery-recorded" }, order.id, { to: "ACCEPTANCE_PERIOD" });
  }
  if (to === "ACCEPTANCE_PERIOD") {
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    await enqueueJob(tx, "order.acceptanceExpiry", { orderId: order.id }, { dedupeKey: `accept-expiry:${order.id}`, runAt: fresh.acceptanceDeadline! });
    await notify(tx, {
      userId: order.buyerId, templateKey: "delivery.confirmed", dedupeKey: `delivered:${order.id}`,
      vars: { orderNumber: order.orderNumber, deadline: fresh.acceptanceDeadline!.toISOString() }, link: `/account/orders/${order.id}`,
    });
  }
  if (to === "ACCEPTED") {
    if (!(await hasOpenFreezingDispute(tx, order.id))) {
      await applyTransition(tx, { kind: "system", reason: "accepted" }, order.id, { to: "SETTLEMENT" });
    }
  }
  if (to === "COMPLETED" && order.listingId) {
    await tx.vehicleListing.update({ where: { id: order.listingId }, data: { availability: "SOLD", status: "SOLD" } });
  }
  if (to === "CANCELLED") {
    await tx.settlementInstruction.updateMany({ where: { orderId: order.id, status: { in: ["SCHEDULED", "ELIGIBLE", "BLOCKED_BY_DISPUTE"] } }, data: { status: "CANCELLED" } });
    await tx.paymentIntent.updateMany({ where: { orderId: order.id, status: { in: ["CREATED", "PENDING"] } }, data: { status: "EXPIRED" } });
    if (order.listingId) {
      const first = await tx.orderTransition.findFirst({ where: { orderId: order.id, sequence: 1 } });
      const prev = (first?.metadata as { listingPrevAvailability?: string } | null)?.listingPrevAvailability;
      const listing = await tx.vehicleListing.findUnique({ where: { id: order.listingId } });
      if (listing?.availability === "RESERVED" && prev) {
        await tx.vehicleListing.update({ where: { id: order.listingId }, data: { availability: prev as never } });
      }
    }
    const held = await orderHeldBalance(tx, order.id, order.currency);
    if (held.isZero()) {
      const paid = await tx.paymentIntent.count({ where: { orderId: order.id, amountReceived: { gt: 0 } } });
      if (paid > 0) await applyTransition(tx, { kind: "system", reason: "no-funds-held" }, order.id, { to: "REFUNDED" });
    }
  }
  void actor;
}

/** Public entry point for user-initiated transitions. */
export function transitionOrder(actor: AnyActor, orderId: string, input: TransitionInput) {
  return transaction((tx) => applyTransition(tx, actor, orderId, input));
}
