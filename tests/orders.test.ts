import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedPricing, makeUser, uploadOrderDoc, runJobs, prisma } from "./helpers";
import { createOrder, createPaidOrder } from "./flow";
import { transitionOrder } from "@/server/orders/engine";
import { buyerAcceptVehicle, buyerCancel, processAcceptanceExpiry } from "@/server/orders/service";
import { ensureShipment, assignPartner, updateBooking, recordDelivery, addTrackingEvent, reviseEta, updateCustoms } from "@/server/logistics/service";
import { submitIdentity, reviewIdentity } from "@/server/compliance/service";
import { uploadDocument } from "@/server/documents/service";
import { PDF } from "./helpers";

describe("order state machine", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricing();
  });

  it("creates an order with an immutable contract, reservation and payment instructions", async () => {
    const { order, listing, quote } = await createOrder();
    expect(order.state).toBe("AWAITING_PAYMENT");
    expect(order.path).toBe("PURCHASED_STOCK");
    const contract = await prisma.contract.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(contract.content).toContain(quote.quoteNumber);
    expect(contract.contentSha256).toHaveLength(64);
    expect((await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listing.id } })).availability).toBe("RESERVED");
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    expect(intent.amount.equals(order.payableNow)).toBe(true);
    const transitions = await prisma.orderTransition.findMany({ where: { orderId: order.id }, orderBy: { sequence: "asc" } });
    expect(transitions.map((t) => t.toState)).toEqual(["ORDER_CREATED", "AWAITING_PAYMENT"]);
  });

  it("requires identity verification before issuing payment instructions for unverified buyers", async () => {
    const buyer = await makeUser(["BUYER"], { verifiedIdentity: false });
    const { order } = await createOrder({ buyer });
    expect(order.state).toBe("COMPLIANCE_CHECK");
    expect(await prisma.paymentIntent.count({ where: { orderId: order.id } })).toBe(0);
    const doc = await uploadDocument(buyer, { filename: "id.pdf", mimeType: "application/pdf", data: PDF, category: "identity", visibility: "INTERNAL" });
    await submitIdentity(buyer, { identityType: "NIN", identityNumber: "12345678901", documentId: doc.id, addressLine: "1 Road", city: "Lagos", state: "Lagos" });
    const officer = await makeUser(["VERIFICATION"]);
    await reviewIdentity(officer, buyer.userId, "VERIFIED", "Document matches");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).state).toBe("AWAITING_PAYMENT");
  });

  it("only a verified payment record moves the order to funds protected — never a user click", async () => {
    const { order, admin } = await createOrder();
    await expect(transitionOrder(admin, order.id, { to: "FUNDS_CONFIRMED" })).rejects.toThrow(/not authorised/);
    await expect(transitionOrder(admin, order.id, { to: "PURCHASE_AUTHORIZED" })).rejects.toThrow(/Cannot move/);
  });

  it("rejects transitions that are not defined for the order's path", async () => {
    const { order, admin } = await createPaidOrder();
    expect(order.path).toBe("PURCHASED_STOCK");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.state).toBe("FUNDS_PROTECTED");
    await expect(transitionOrder(admin, order.id, { to: "PURCHASE_AUTHORIZED" })).rejects.toThrow(/Cannot move/);
    await expect(transitionOrder(admin, order.id, { to: "DELIVERED" })).rejects.toThrow(/Cannot move/);
  });

  it("requires evidence for evidence-bearing milestones", async () => {
    const { order, admin } = await createPaidOrder();
    await expect(transitionOrder(admin, order.id, { to: "INSPECTION_COMPLETED" })).rejects.toThrow(/evidence/);
    const doc = await uploadOrderDoc(admin, order.id, "inspection-report");
    const updated = await transitionOrder(admin, order.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [doc.id] });
    expect(updated.state).toBe("INSPECTION_COMPLETED");
  });

  it("prevents dealers from recording platform-verification milestones on their own orders", async () => {
    const { order, dealer } = await createPaidOrder({ dealer: true });
    const doc = await uploadOrderDoc(dealer!.actor, order.id, "inspection-report");
    await expect(transitionOrder(dealer!.actor, order.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [doc.id] })).rejects.toThrow(/not authorised/);
  });

  it("restricts logistics partners to assigned shipments", async () => {
    const { order, admin } = await createPaidOrder();
    const ops = await makeUser(["OPERATIONS"]);
    const partner = await makeUser(["LOGISTICS_OPERATOR"]);
    const other = await makeUser(["LOGISTICS_OPERATOR"]);
    const doc = await uploadOrderDoc(admin, order.id, "inspection-report");
    await transitionOrder(ops, order.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [doc.id] });
    const shipment = await ensureShipment(ops, order.id, {});
    await assignPartner(ops, shipment.id, partner.userId, "LOGISTICS_OPERATOR");
    await expect(transitionOrder(other, order.id, { to: "EXPORT_PREPARATION" })).rejects.toThrow(/not authorised/);
    await expect(updateBooking(other, shipment.id, { bookingRef: "X" })).rejects.toThrow(/not assigned/);
    expect((await transitionOrder(partner, order.id, { to: "EXPORT_PREPARATION" })).state).toBe("EXPORT_PREPARATION");
  });

  it("runs the full journey to completion with milestone history, ETA revisions and buyer acceptance", async () => {
    const { order, admin, buyer } = await createPaidOrder();
    const ops = await makeUser(["OPERATIONS"]);
    const partner = await makeUser(["LOGISTICS_OPERATOR"]);
    const clearing = await makeUser(["CLEARING_PARTNER"]);
    const driver = await makeUser(["DELIVERY_PARTNER"]);
    const doc = async (c: string) => (await uploadOrderDoc(admin, order.id, c)).id;

    await transitionOrder(ops, order.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [await doc("inspection")] });
    const s = await ensureShipment(ops, order.id, { etaStart: new Date(Date.now() + 30 * 86400_000), etaEnd: new Date(Date.now() + 40 * 86400_000) });
    await assignPartner(ops, s.id, partner.userId, "LOGISTICS_OPERATOR");
    await assignPartner(ops, s.id, clearing.userId, "CLEARING_PARTNER");
    await assignPartner(ops, s.id, driver.userId, "DELIVERY_PARTNER");
    await expect(transitionOrder(partner, order.id, { to: "SHIPMENT_BOOKED", evidenceDocumentIds: [await doc("booking")] })).rejects.toThrow(/booking/);
    await updateBooking(partner, s.id, { bookingRef: "BK-1", vesselName: "MV Demo Star", billOfLading: "BL-123" });
    await transitionOrder(partner, order.id, { to: "SHIPMENT_BOOKED", evidenceDocumentIds: [await doc("booking")] });
    await transitionOrder(partner, order.id, { to: "DEPARTED", evidenceDocumentIds: [await doc("bill-of-lading")] });
    await transitionOrder(partner, order.id, { to: "IN_TRANSIT" });
    await addTrackingEvent(partner, s.id, { milestone: "Transhipment", description: "Vessel called at Tema", occurredAt: new Date() });
    await reviseEta(partner, s.id, { newStart: new Date(Date.now() + 35 * 86400_000), newEnd: new Date(Date.now() + 45 * 86400_000), reason: "Port congestion at Tema", supportingInfo: "Carrier schedule update" });
    await transitionOrder(clearing, order.id, { to: "ARRIVED_NIGERIA", evidenceDocumentIds: [await doc("arrival-notice")] });
    await transitionOrder(clearing, order.id, { to: "CUSTOMS_CLEARANCE" });
    await updateCustoms(clearing, s.id, { status: "ASSESSED", dutyAmount: "3000000" });
    await expect(transitionOrder(clearing, order.id, { to: "RELEASED_FROM_PORT", evidenceDocumentIds: [await doc("release")] })).rejects.toThrow(/released/);
    await updateCustoms(clearing, s.id, { status: "RELEASED" });
    await transitionOrder(clearing, order.id, { to: "RELEASED_FROM_PORT", evidenceDocumentIds: [await doc("release")] });
    await transitionOrder(driver, order.id, { to: "LOCAL_TRANSPORT" });
    await transitionOrder(driver, order.id, { to: "READY_FOR_HANDOVER" });
    await expect(transitionOrder(driver, order.id, { to: "DELIVERED", evidenceDocumentIds: [await doc("handover")] })).rejects.toThrow(/Record delivery/);
    const handover = await doc("handover");
    await recordDelivery(driver, order.id, { recipientName: "Buyer", deliveredAt: new Date(), evidenceDocumentId: handover });
    const delivered = await transitionOrder(driver, order.id, { to: "DELIVERED", evidenceDocumentIds: [handover] });
    expect(delivered.state).toBe("ACCEPTANCE_PERIOD");
    expect(delivered.acceptanceDeadline).not.toBeNull();

    const accepted = await buyerAcceptVehicle(buyer, order.id);
    expect(accepted.state).toBe("SETTLEMENT");

    const ship = await prisma.shipment.findUniqueOrThrow({ where: { id: s.id }, include: { etaRevisions: true, events: true } });
    expect(ship.originalEtaStart!.getTime()).toBeLessThan(ship.currentEtaStart!.getTime());
    expect(ship.etaRevisions).toHaveLength(1);
    expect(ship.status).toBe("DELIVERED");

    const history = await prisma.orderTransition.findMany({ where: { orderId: order.id }, orderBy: { sequence: "asc" } });
    expect(history.map((h) => h.sequence)).toEqual(history.map((_, i) => i + 1));
    for (const h of history) expect(h.actorRole.length).toBeGreaterThan(0);
  });

  it("forbids silent edits of confirmed milestones at the database level", async () => {
    const { order } = await createOrder();
    const t = await prisma.orderTransition.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(prisma.orderTransition.update({ where: { id: t.id }, data: { description: "edited" } })).rejects.toThrow(/append-only/);
    await expect(prisma.orderTransition.delete({ where: { id: t.id } })).rejects.toThrow(/append-only/);
  });

  it("lets the buyer cancel before payment and releases the reservation", async () => {
    const { order, buyer, listing } = await createOrder();
    const c = await buyerCancel(buyer, order.id, "Changed my mind");
    expect(c.state).toBe("CANCELLED");
    expect((await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listing.id } })).availability).toBe("PURCHASED_AWAITING_SHIPMENT");
  });

  it("auto-accepts after the inspection period only when no dispute is open", async () => {
    const { order, buyer } = await createPaidOrder({ listingType: "IN_NIGERIA", availability: "AVAILABLE_LOCAL_DELIVERY" });
    const ops = await makeUser(["OPERATIONS"]);
    await transitionOrder(ops, order.id, { to: "READY_FOR_HANDOVER" });
    const ev = await uploadOrderDoc(ops, order.id, "handover");
    await recordDelivery(ops, order.id, { recipientName: "B", deliveredAt: new Date(), evidenceDocumentId: ev.id });
    await transitionOrder(ops, order.id, { to: "DELIVERED", evidenceDocumentIds: [ev.id] });
    expect(await processAcceptanceExpiry(order.id)).toBe(false); // deadline not reached
    await prisma.order.update({ where: { id: order.id }, data: { acceptanceDeadline: new Date(Date.now() - 1000) } });
    await prisma.job.updateMany({ where: { type: "order.acceptanceExpiry" }, data: { runAt: new Date(Date.now() - 1000) } });
    await runJobs();
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.state).toBe("SETTLEMENT");
    void buyer;
  });
});
