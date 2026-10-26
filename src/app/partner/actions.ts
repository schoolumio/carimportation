"use server";
import { act, fileFrom, str } from "@/server/web/actions";
import { requireActor } from "@/server/web/session";
import { prisma } from "@/server/db";
import { uploadDocument } from "@/server/documents/service";
import { transitionOrder } from "@/server/orders/engine";
import { addTrackingEvent, recordDelivery, reviseEta, scheduleDelivery, updateBooking, updateCustoms, assertShipmentAccess } from "@/server/logistics/service";
import { submitCostAdjustment } from "@/server/logistics/costs";
import { invalid } from "@/lib/errors";
import type { Beneficiary, CustomsStatus, OrderState } from "@prisma/client";

async function ctx(fd: FormData) {
  const actor = await requireActor();
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: str(fd, "shipmentId") } });
  return { actor, shipment, back: str(fd, "back") || `/partner/shipments/${shipment.id}` };
}

async function evidence(actor: Awaited<ReturnType<typeof requireActor>>, fd: FormData, orderId: string, shipmentId: string, category: string) {
  const f = await fileFrom(fd, "file");
  if (!f) return null;
  await assertShipmentAccess(actor, shipmentId, ["LOGISTICS_OPERATOR", "CLEARING_PARTNER", "DELIVERY_PARTNER"]);
  return uploadDocument(actor, { ...f, category, visibility: "ORDER_PARTIES", orderId, shipmentId });
}

export async function partnerMilestoneAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, async () => {
    const doc = await evidence(actor, fd, shipment.orderId, shipment.id, str(fd, "category") || "milestone-evidence");
    await transitionOrder(actor, shipment.orderId, { to: str(fd, "to") as OrderState, description: str(fd, "description") || undefined, evidenceDocumentIds: doc ? [doc.id] : [] });
  }, "Milestone recorded.");
}

export async function bookingAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  const opt = (k: string) => str(fd, k) || undefined;
  await act(back, () => updateBooking(actor, shipment.id, { bookingRef: opt("bookingRef"), vesselName: opt("vesselName"), voyageNumber: opt("voyageNumber"), containerNumber: opt("containerNumber"), billOfLading: opt("billOfLading"), originPort: opt("originPort"), plannedDeparture: str(fd, "plannedDeparture") ? new Date(str(fd, "plannedDeparture")) : undefined }), "Booking details saved (changes are audited).");
}

export async function trackingAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, async () => {
    const doc = await evidence(actor, fd, shipment.orderId, shipment.id, "tracking-evidence");
    await addTrackingEvent(actor, shipment.id, { milestone: str(fd, "milestone"), description: str(fd, "description"), location: str(fd, "location"), occurredAt: new Date(str(fd, "occurredAt") || Date.now()), evidenceDocumentId: doc?.id, visibleToBuyer: str(fd, "internal") !== "on" });
  }, "Tracking update recorded.");
}

export async function etaAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, async () => {
    const doc = await evidence(actor, fd, shipment.orderId, shipment.id, "eta-evidence");
    await reviseEta(actor, shipment.id, { newStart: new Date(str(fd, "newStart")), newEnd: new Date(str(fd, "newEnd")), reason: str(fd, "reason"), supportingInfo: str(fd, "supportingInfo"), evidenceDocumentId: doc?.id });
  }, "ETA revised; the buyer has been notified with the reason.");
}

export async function customsAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, async () => {
    await evidence(actor, fd, shipment.orderId, shipment.id, "customs-document");
    await updateCustoms(actor, shipment.id, { status: str(fd, "status") as CustomsStatus, declarationRef: str(fd, "declarationRef"), assessedValue: str(fd, "assessedValue"), dutyAmount: str(fd, "dutyAmount"), vatAmount: str(fd, "vatAmount"), leviesAmount: str(fd, "leviesAmount"), clearingFee: str(fd, "clearingFee"), terminalCharges: str(fd, "terminalCharges"), notes: str(fd, "notes") });
  }, "Customs record updated.");
}

export async function scheduleDeliveryAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, () => scheduleDelivery(actor, shipment.orderId, { address: str(fd, "address"), scheduledFor: new Date(str(fd, "scheduledFor")) }), "Delivery scheduled; buyer notified.");
}

export async function recordDeliveryAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, async () => {
    const doc = await evidence(actor, fd, shipment.orderId, shipment.id, "delivery-handover");
    if (!doc) throw invalid("Upload the signed handover note or photos.");
    await recordDelivery(actor, shipment.orderId, { recipientName: str(fd, "recipientName"), deliveredAt: new Date(str(fd, "deliveredAt") || Date.now()), odometerReading: str(fd, "odometer") ? Number(str(fd, "odometer")) : undefined, evidenceDocumentId: doc.id, notes: str(fd, "notes") });
    await transitionOrder(actor, shipment.orderId, { to: "DELIVERED", evidenceDocumentIds: [doc.id], description: `Handed over to ${str(fd, "recipientName")}` });
  }, "Delivery recorded. The buyer's inspection period has started.");
}

export async function partnerCostAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, async () => {
    const doc = await evidence(actor, fd, shipment.orderId, shipment.id, "cost-evidence");
    if (!doc) throw invalid("Evidence is required.");
    await submitCostAdjustment(actor, { orderId: shipment.orderId, code: str(fd, "code").toUpperCase().replace(/[^A-Z0-9_]/g, "_"), label: str(fd, "label"), amount: str(fd, "amount"), reason: str(fd, "reason"), beneficiary: str(fd, "beneficiary") as Beneficiary, evidenceDocumentId: doc.id, contractualClause: str(fd, "clause") });
  }, "Charge submitted for internal review and buyer approval.");
}

export async function partnerDocAction(fd: FormData) {
  const { actor, shipment, back } = await ctx(fd);
  await act(back, async () => {
    if (!(await evidence(actor, fd, shipment.orderId, shipment.id, str(fd, "category")))) throw invalid("Choose a file.");
  }, "Document uploaded.");
}
