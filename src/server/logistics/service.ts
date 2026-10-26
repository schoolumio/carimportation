import type { AssignmentRole, CustomsStatus, ShippingMethod, TrackingSource } from "@prisma/client";
import { prisma, transaction, type Tx } from "@/server/db";
import { newShipmentRef } from "@/lib/ids";
import { D } from "@/lib/money";
import { forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify } from "@/server/notifications/notify";

const PARTNER_ROLE_PERMISSION: Record<AssignmentRole, "order.transition.logistics" | "order.transition.clearing" | "order.transition.delivery"> = {
  LOGISTICS_OPERATOR: "order.transition.logistics",
  CLEARING_PARTNER: "order.transition.clearing",
  DELIVERY_PARTNER: "order.transition.delivery",
};

/** Partners may only act on shipments assigned to them; operations staff with shipment.manage act on all. */
export async function assertShipmentAccess(actor: Actor, shipmentId: string, roles: AssignmentRole[], db: Tx | typeof prisma = prisma) {
  if (can(actor, "shipment.manage")) return;
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId }, include: { order: true } });
  if (!shipment) throw notFound("Shipment");
  if (shipment.order.dealerOrgId && actor.dealerOrgIds.includes(shipment.order.dealerOrgId) && roles.includes("LOGISTICS_OPERATOR")) return;
  const a = await db.shipmentAssignment.findFirst({ where: { shipmentId, userId: actor.userId, role: { in: roles } } });
  if (!a || !can(actor, PARTNER_ROLE_PERMISSION[a.role])) throw forbidden("This shipment is not assigned to you.");
}

export async function ensureShipment(actor: Actor, orderId: string, input: { method?: ShippingMethod; originPort?: string; destinationPort?: string; etaStart?: Date; etaEnd?: Date }) {
  requirePermission(actor, "shipment.manage");
  return transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { listing: true, shipment: true } });
    if (!order) throw notFound("Order");
    if (order.shipment) return order.shipment;
    const s = await tx.shipment.create({
      data: {
        orderId, reference: newShipmentRef(), method: input.method ?? order.listing?.shippingMethod ?? "RORO",
        originPort: input.originPort ?? order.listing?.originPort, destinationPort: input.destinationPort ?? "Lagos (Apapa / Tin Can)",
        originalEtaStart: input.etaStart, originalEtaEnd: input.etaEnd, currentEtaStart: input.etaStart, currentEtaEnd: input.etaEnd,
        isDemo: order.isDemo, customs: { create: {} },
      },
    });
    await audit(tx, { actor, action: "shipment.created", entityType: "Shipment", entityId: s.id, summary: `Shipment ${s.reference} created for order ${order.orderNumber}` });
    return s;
  });
}

export async function assignPartner(actor: Actor, shipmentId: string, userId: string, role: AssignmentRole) {
  requirePermission(actor, "shipment.manage");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!user) throw notFound("User");
  const roleKeys = user.roles.map((r) => r.role.key);
  if (!roleKeys.includes(role) && !roleKeys.includes("OPERATIONS")) throw invalid(`User does not hold the ${role} role.`);
  const a = await prisma.shipmentAssignment.upsert({
    where: { shipmentId_userId_role: { shipmentId, userId, role } },
    create: { shipmentId, userId, role },
    update: {},
  });
  await audit(prisma, { actor, action: "shipment.assigned", entityType: "Shipment", entityId: shipmentId, summary: `Assigned ${user.email} as ${role}` });
  return a;
}

export async function updateBooking(actor: Actor, shipmentId: string, input: { providerId?: string | null; bookingRef?: string; vesselName?: string; voyageNumber?: string; containerNumber?: string; billOfLading?: string; plannedDeparture?: Date | null; originPort?: string }) {
  await assertShipmentAccess(actor, shipmentId, ["LOGISTICS_OPERATOR"]);
  const before = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  // Confirmed references cannot be silently overwritten — changes are audited with before/after values.
  const s = await prisma.shipment.update({ where: { id: shipmentId }, data: { ...input, lastUpdateAt: new Date() } });
  await audit(prisma, {
    actor, action: "shipment.booking_updated", entityType: "Shipment", entityId: shipmentId, summary: "Booking details updated",
    before: { bookingRef: before.bookingRef, vesselName: before.vesselName, billOfLading: before.billOfLading, containerNumber: before.containerNumber },
    after: input,
  });
  return s;
}

export async function addTrackingEvent(actor: Actor, shipmentId: string, input: { milestone: string; description: string; location?: string; occurredAt: Date; evidenceDocumentId?: string; visibleToBuyer?: boolean; correctsEventId?: string; source?: TrackingSource }) {
  await assertShipmentAccess(actor, shipmentId, ["LOGISTICS_OPERATOR", "CLEARING_PARTNER", "DELIVERY_PARTNER"]);
  if (input.occurredAt.getTime() > Date.now() + 5 * 60_000) throw invalid("Tracking events cannot be recorded in the future.");
  if (input.description.trim().length < 3) throw invalid("Describe the update.");
  return transaction(async (tx) => {
    const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { order: true } });
    if (input.evidenceDocumentId) {
      const doc = await tx.document.findUnique({ where: { id: input.evidenceDocumentId } });
      if (!doc || (doc.orderId !== shipment.orderId && doc.shipmentId !== shipmentId)) throw precondition("Evidence must belong to this shipment.");
    }
    const ev = await tx.trackingEvent.create({
      data: {
        shipmentId, milestone: input.milestone, description: input.description.trim(), location: input.location, occurredAt: input.occurredAt,
        recordedById: actor.userId, source: input.source ?? "MANUAL_VERIFIED", evidenceDocumentId: input.evidenceDocumentId,
        visibleToBuyer: input.visibleToBuyer ?? true, correctsEventId: input.correctsEventId, isDemo: shipment.isDemo,
      },
    });
    await tx.shipment.update({ where: { id: shipmentId }, data: { lastUpdateAt: new Date() } });
    await audit(tx, { actor, action: "tracking.event_added", entityType: "Shipment", entityId: shipmentId, summary: `${input.milestone}: ${input.description}` });
    if (ev.visibleToBuyer) {
      await notify(tx, { userId: shipment.order.buyerId, templateKey: "order.milestone", dedupeKey: `tracking:${ev.id}`, vars: { orderNumber: shipment.order.orderNumber, milestone: input.milestone, description: input.description }, link: `/account/orders/${shipment.orderId}` });
    }
    return ev;
  });
}

/** Revise the ETA. The original estimate and every revision are preserved with reasons and evidence. */
export async function reviseEta(actor: Actor, shipmentId: string, input: { newStart: Date; newEnd: Date; reason: string; supportingInfo: string; evidenceDocumentId?: string }) {
  await assertShipmentAccess(actor, shipmentId, ["LOGISTICS_OPERATOR", "CLEARING_PARTNER"]);
  if (input.newEnd < input.newStart) throw invalid("ETA end must be after start.");
  if (input.reason.trim().length < 5 || input.supportingInfo.trim().length < 5) throw invalid("Explain the reason and the information supporting the revision.");
  return transaction(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { order: true } });
    await tx.etaRevision.create({
      data: { shipmentId, previousStart: s.currentEtaStart, previousEnd: s.currentEtaEnd, newStart: input.newStart, newEnd: input.newEnd, reason: input.reason.trim(), supportingInfo: input.supportingInfo.trim(), evidenceDocumentId: input.evidenceDocumentId, createdById: actor.userId },
    });
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { currentEtaStart: input.newStart, currentEtaEnd: input.newEnd, lastUpdateAt: new Date(), ...(s.originalEtaStart ? {} : { originalEtaStart: input.newStart, originalEtaEnd: input.newEnd }) },
    });
    await audit(tx, { actor, action: "shipment.eta_revised", entityType: "Shipment", entityId: shipmentId, summary: `ETA revised: ${input.reason}`, before: { start: s.currentEtaStart, end: s.currentEtaEnd }, after: { start: input.newStart, end: input.newEnd } });
    await notify(tx, { userId: s.order.buyerId, templateKey: "order.eta_changed", dedupeKey: `eta:${shipmentId}:${input.newStart.getTime()}:${input.newEnd.getTime()}`, vars: { orderNumber: s.order.orderNumber, eta: `${input.newStart.toISOString().slice(0, 10)} – ${input.newEnd.toISOString().slice(0, 10)}`, reason: input.reason }, link: `/account/orders/${s.orderId}` });
  });
}

export async function updateCustoms(actor: Actor, shipmentId: string, input: { status: CustomsStatus; declarationRef?: string; assessedValue?: string; dutyAmount?: string; vatAmount?: string; leviesAmount?: string; clearingFee?: string; terminalCharges?: string; notes?: string }) {
  await assertShipmentAccess(actor, shipmentId, ["CLEARING_PARTNER"]);
  const money = (v?: string) => (v && v.trim() !== "" ? new D(v) : undefined);
  const before = await prisma.customsRecord.findUnique({ where: { shipmentId } });
  const data = {
    status: input.status, declarationRef: input.declarationRef || undefined, assessedValue: money(input.assessedValue), dutyAmount: money(input.dutyAmount),
    vatAmount: money(input.vatAmount), leviesAmount: money(input.leviesAmount), clearingFee: money(input.clearingFee), terminalCharges: money(input.terminalCharges),
    notes: input.notes, updatedById: actor.userId, ...(input.status === "RELEASED" ? { releasedAt: new Date() } : {}),
  };
  const rec = await prisma.customsRecord.upsert({ where: { shipmentId }, create: { shipmentId, ...data }, update: data });
  await audit(prisma, { actor, action: "customs.updated", entityType: "CustomsRecord", entityId: rec.id, summary: `Customs status ${input.status}`, before, after: data });
  return rec;
}

export async function scheduleDelivery(actor: Actor, orderId: string, input: { address: string; scheduledFor: Date; partnerUserId?: string }) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipment: true } });
  if (order.shipment) await assertShipmentAccess(actor, order.shipment.id, ["DELIVERY_PARTNER"]);
  else requirePermission(actor, "shipment.manage");
  const rec = await prisma.deliveryRecord.upsert({
    where: { orderId },
    create: { orderId, address: input.address, scheduledFor: input.scheduledFor, partnerUserId: input.partnerUserId ?? actor.userId },
    update: { address: input.address, scheduledFor: input.scheduledFor, partnerUserId: input.partnerUserId ?? undefined },
  });
  await audit(prisma, { actor, action: "delivery.scheduled", entityType: "DeliveryRecord", entityId: rec.id, summary: `Delivery scheduled ${input.scheduledFor.toISOString()}` });
  await notify(prisma, { userId: order.buyerId, templateKey: "delivery.scheduled", dedupeKey: `delivery:${orderId}:${input.scheduledFor.getTime()}`, vars: { orderNumber: order.orderNumber, when: input.scheduledFor.toISOString(), address: input.address }, link: `/account/orders/${orderId}` });
  return rec;
}

export async function recordDelivery(actor: Actor, orderId: string, input: { recipientName: string; deliveredAt: Date; odometerReading?: number; evidenceDocumentId: string; notes?: string }) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipment: true } });
  if (order.shipment) await assertShipmentAccess(actor, order.shipment.id, ["DELIVERY_PARTNER"]);
  else requirePermission(actor, "order.transition.ops");
  if (!input.evidenceDocumentId) throw invalid("Delivery evidence (signed handover note or photos) is required.");
  const doc = await prisma.document.findUnique({ where: { id: input.evidenceDocumentId } });
  if (!doc || doc.orderId !== orderId) throw precondition("Evidence must belong to this order.");
  const rec = await prisma.deliveryRecord.upsert({
    where: { orderId },
    create: { orderId, address: "Recorded at delivery", deliveredAt: input.deliveredAt, recipientName: input.recipientName, odometerReading: input.odometerReading, evidenceDocumentId: input.evidenceDocumentId, notes: input.notes, partnerUserId: actor.userId },
    update: { deliveredAt: input.deliveredAt, recipientName: input.recipientName, odometerReading: input.odometerReading, evidenceDocumentId: input.evidenceDocumentId, notes: input.notes },
  });
  await audit(prisma, { actor, action: "delivery.recorded", entityType: "DeliveryRecord", entityId: rec.id, summary: `Delivered to ${input.recipientName}` });
  return rec;
}

export async function shipmentsForPartner(actor: Actor) {
  return prisma.shipment.findMany({
    where: can(actor, "shipment.manage") ? {} : { assignments: { some: { userId: actor.userId } } },
    include: { order: { include: { listing: true } }, assignments: true, customs: true },
    orderBy: { updatedAt: "desc" },
  });
}
