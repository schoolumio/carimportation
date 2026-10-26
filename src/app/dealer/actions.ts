"use server";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/crypto";
import { act, errorMessage, fileFrom, str } from "@/server/web/actions";
import { requireActor } from "@/server/web/session";
import { prisma } from "@/server/db";
import { addMedia, createListing, recordInspection, removeMedia, respondInquiry, submitForReview, updateListing, type ListingInput } from "@/server/inventory/service";
import { getStorage, uploadDocument } from "@/server/documents/service";
import { submitVerificationDocument } from "@/server/dealers/service";
import { transitionOrder } from "@/server/orders/engine";
import { submitOffer } from "@/server/sourcing/service";
import { requestPayout } from "@/server/settlement/payouts";
import { addDisputeEvidence } from "@/server/disputes/service";
import { submitCostAdjustment } from "@/server/logistics/costs";
import { updateBooking } from "@/server/logistics/service";
import { invalid } from "@/lib/errors";
import type { Beneficiary, OrderState, VerificationCheckType } from "@prisma/client";

async function orgOf() {
  const actor = await requireActor("/dealer");
  const orgId = actor.dealerOrgIds[0];
  if (!orgId) redirect("/dealers/apply");
  return { actor, orgId };
}

function listingInput(fd: FormData): ListingInput {
  const g = (k: string) => str(fd, k);
  const n = (k: string) => (g(k) ? Number(g(k)) : null);
  return {
    listingType: g("listingType") as never, availability: g("availability") as never, make: g("make"), model: g("model"), year: Number(g("year")), trim: g("trim"),
    bodyStyle: g("bodyStyle"), vin: g("vin"), vinVisibility: (g("vinVisibility") || "MASKED") as never, mileage: Number(g("mileage")), mileageUnit: (g("mileageUnit") || "km") as never,
    conditionGrade: g("conditionGrade"), conditionSummary: g("conditionSummary"), damageDisclosure: g("damageDisclosure"), previousUse: g("previousUse"), ownershipInfo: g("ownershipInfo"),
    knownDefects: g("knownDefects"), requiredRepairs: g("requiredRepairs"), sourceName: g("sourceName"), sourceCountry: g("sourceCountry"), currentLocation: g("currentLocation"),
    originPort: g("originPort"), price: g("price").replace(/[,\s]/g, ""), priceCurrency: g("priceCurrency") as never, dealerFee: g("dealerFee").replace(/[,\s]/g, "") || "0",
    shippingMethod: (g("shippingMethod") || "RORO") as never, shipmentWindowStart: g("shipmentWindowStart") || null, shipmentWindowEnd: g("shipmentWindowEnd") || null,
    estArrivalStart: g("estArrivalStart") || null, estArrivalEnd: g("estArrivalEnd") || null, auctionLotNumber: g("auctionLotNumber"), auctionDate: g("auctionDate") || null,
    auctionFeeEstimate: g("auctionFeeEstimate"), storageDeadline: g("storageDeadline") || null, biddingNotes: g("biddingNotes"), cancellationTerms: g("cancellationTerms"),
    warrantyText: g("warrantyText"), disclaimer: g("disclaimer"), supplierId: g("supplierId"), engineCapacityCc: n("engineCapacityCc"), fuelType: g("fuelType"),
    transmission: g("transmission"), drivetrain: g("drivetrain"), steering: (g("steering") || "LHD") as never, exteriorColor: g("exteriorColor"), interiorColor: g("interiorColor"),
    doors: n("doors"), seats: n("seats"), extras: g("extras"),
  };
}

export async function createListingAction(fd: FormData) {
  const { actor, orgId } = await orgOf();
  let id = "";
  try {
    id = (await createListing(actor, listingInput(fd), { dealerOrgId: orgId })).id;
  } catch (e) {
    redirect(`/dealer/listings/new?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(`/dealer/listings/${id}?ok=${encodeURIComponent("Draft saved. Add photos and documents, then submit for review.")}`);
}

export async function updateListingAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "listingId");
  await act(`/dealer/listings/${id}`, () => updateListing(actor, id, listingInput(fd)), "Listing updated.");
}

export async function submitListingAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "listingId");
  await act(`/dealer/listings/${id}`, () => submitForReview(actor, id), "Submitted for review.");
}

const MEDIA_TYPES: Record<string, { ext: string; kind: "PHOTO" | "VIDEO"; check: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", kind: "PHOTO", check: (b) => b[0] === 0xff && b[1] === 0xd8 },
  "image/png": { ext: "png", kind: "PHOTO", check: (b) => b.subarray(1, 4).toString() === "PNG" },
  "image/webp": { ext: "webp", kind: "PHOTO", check: (b) => b.subarray(8, 12).toString() === "WEBP" },
  "video/mp4": { ext: "mp4", kind: "VIDEO", check: (b) => b.subarray(4, 8).toString() === "ftyp" },
};

/** Shared by dealer and admin listing editors. */
export async function uploadMediaAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "listingId");
  await act(str(fd, "back") || `/dealer/listings/${id}`, async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Choose a photo or video.");
    const t = MEDIA_TYPES[f.mimeType];
    if (!t || !t.check(f.data)) throw invalid("Upload JPEG, PNG, WebP or MP4 files.");
    if (f.data.length > 10 * 1024 * 1024) throw invalid("Max 10 MB per file.");
    const key = `${randomToken(16)}.${t.ext}`;
    await getStorage().put(`media/${key}`, f.data);
    await addMedia(actor, id, { kind: t.kind, url: `/api/media/${key}`, caption: str(fd, "caption") });
  }, "Media added.");
}

export async function removeMediaAction(fd: FormData) {
  const actor = await requireActor();
  await act(str(fd, "back"), () => removeMedia(actor, str(fd, "mediaId")), "Media removed.");
}

export async function listingDocAction(fd: FormData) {
  const actor = await requireActor();
  const id = str(fd, "listingId");
  await act(str(fd, "back") || `/dealer/listings/${id}`, async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Choose a file.");
    const doc = await uploadDocument(actor, { ...f, category: str(fd, "category"), visibility: str(fd, "public") === "on" ? "PUBLIC_LISTING" : "DEALER_AND_INTERNAL", listingId: id });
    if (str(fd, "category") === "inspection-report" && str(fd, "inspectorName")) {
      await recordInspection(actor, id, { inspectorName: str(fd, "inspectorName"), inspectorType: (str(fd, "inspectorType") || "DEALER") as never, grade: str(fd, "grade"), summary: str(fd, "summary") || "See report", reportDocumentId: doc.id, inspectedAt: new Date(str(fd, "inspectedAt") || Date.now()) });
    }
  }, "Document uploaded. Our team will review it.");
}

export async function verificationDocAction(fd: FormData) {
  const { actor, orgId } = await orgOf();
  await act("/dealer/onboarding", async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Choose a file.");
    const doc = await uploadDocument(actor, { ...f, category: `verification-${str(fd, "checkType").toLowerCase()}`, visibility: "DEALER_AND_INTERNAL", dealerOrgId: orgId });
    await submitVerificationDocument(actor, orgId, str(fd, "checkType") as VerificationCheckType, doc.id);
  }, "Evidence submitted.");
}

export async function inquiryReplyAction(fd: FormData) {
  const actor = await requireActor();
  await act("/dealer/inquiries", () => respondInquiry(actor, str(fd, "inquiryId"), str(fd, "response")), "Reply sent.");
}

export async function dealerMilestoneAction(fd: FormData) {
  const actor = await requireActor();
  const orderId = str(fd, "orderId");
  await act(`/dealer/orders/${orderId}`, async () => {
    const f = await fileFrom(fd, "file");
    const ids: string[] = [];
    if (f) ids.push((await uploadDocument(actor, { ...f, category: str(fd, "category") || "milestone-evidence", visibility: "ORDER_PARTIES", orderId })).id);
    await transitionOrder(actor, orderId, { to: str(fd, "to") as OrderState, description: str(fd, "description") || undefined, evidenceDocumentIds: ids });
  }, "Milestone recorded.");
}

export async function dealerBookingAction(fd: FormData) {
  const actor = await requireActor();
  const orderId = str(fd, "orderId");
  await act(`/dealer/orders/${orderId}`, async () => {
    const s = await prisma.shipment.findUnique({ where: { orderId } });
    if (!s) throw invalid("Operations has not opened a shipment record for this order yet.");
    await updateBooking(actor, s.id, { bookingRef: str(fd, "bookingRef") || undefined, vesselName: str(fd, "vesselName") || undefined, voyageNumber: str(fd, "voyageNumber") || undefined, billOfLading: str(fd, "billOfLading") || undefined });
  }, "Booking details recorded.");
}

export async function dealerOrderDocAction(fd: FormData) {
  const actor = await requireActor();
  const orderId = str(fd, "orderId");
  await act(`/dealer/orders/${orderId}`, async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Choose a file.");
    await uploadDocument(actor, { ...f, category: str(fd, "category"), visibility: "ORDER_PARTIES", orderId });
  }, "Document uploaded.");
}

export async function dealerCostAction(fd: FormData) {
  const actor = await requireActor();
  const orderId = str(fd, "orderId");
  await act(`/dealer/orders/${orderId}`, async () => {
    const f = await fileFrom(fd, "file");
    if (!f) throw invalid("Evidence is required.");
    const doc = await uploadDocument(actor, { ...f, category: "cost-evidence", visibility: "ORDER_PARTIES", orderId });
    await submitCostAdjustment(actor, { orderId, code: str(fd, "code").toUpperCase().replace(/[^A-Z0-9_]/g, "_"), label: str(fd, "label"), amount: str(fd, "amount"), reason: str(fd, "reason"), beneficiary: str(fd, "beneficiary") as Beneficiary, evidenceDocumentId: doc.id, contractualClause: str(fd, "clause") });
  }, "Cost submitted for review. The buyer is only charged after review and approval.");
}

export async function dealerDisputeAction(fd: FormData) {
  const actor = await requireActor();
  await act("/dealer/disputes", async () => {
    const d = await prisma.dispute.findUniqueOrThrow({ where: { id: str(fd, "disputeId") } });
    const f = await fileFrom(fd, "file");
    const doc = f ? await uploadDocument(actor, { ...f, category: "dispute-evidence", visibility: "ORDER_PARTIES", orderId: d.orderId }) : null;
    await addDisputeEvidence(actor, d.id, str(fd, "note"), doc?.id);
  }, "Response submitted.");
}

export async function offerAction(fd: FormData) {
  const { actor, orgId } = await orgOf();
  await act("/dealer/sourcing", () => submitOffer(actor, str(fd, "requestId"), {
    vehicleDescription: str(fd, "vehicleDescription"), year: Number(str(fd, "year")), mileage: str(fd, "mileage") ? Number(str(fd, "mileage")) : undefined,
    sourceCountry: str(fd, "sourceCountry"), vehiclePrice: str(fd, "vehiclePrice"), vehicleCurrency: str(fd, "vehicleCurrency") as never,
    engineCapacityCc: str(fd, "engineCapacityCc") ? Number(str(fd, "engineCapacityCc")) : undefined, shippingMethod: "RORO", timelineNotes: str(fd, "timelineNotes"),
    conditionNotes: str(fd, "conditionNotes"), validDays: Number(str(fd, "validDays") || 7),
  }, orgId), "Offer sent to the buyer.");
}

export async function payoutAction(fd: FormData) {
  const { actor, orgId } = await orgOf();
  await act("/dealer/finance", () => requestPayout(actor, orgId, str(fd, "amount")), "Payout requested. Finance will review it.");
}
