import { z } from "zod";
import { prisma } from "@/server/db";
import { newSourcingRef } from "@/lib/ids";
import { D } from "@/lib/money";
import { forbidden, notFound, precondition } from "@/lib/errors";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify, notifyRole } from "@/server/notifications/notify";

export const sourcingRequestSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().toLowerCase().email(),
  contactPhone: z.string().trim().max(30).optional().or(z.literal("")),
  make: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(60),
  yearMin: z.coerce.number().int().min(1990).max(2100),
  yearMax: z.coerce.number().int().min(1990).max(2100),
  trim: z.string().trim().max(60).optional().or(z.literal("")),
  maxMileage: z.coerce.number().int().min(0).optional(),
  budgetMax: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter your budget in naira"),
  preferredCountries: z.array(z.string().length(2)).default([]),
  fuelType: z.string().max(20).optional().or(z.literal("")),
  transmission: z.string().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
}).refine((d) => d.yearMax >= d.yearMin, { message: "Year range is invalid", path: ["yearMax"] });

export async function createSourcingRequest(actor: Actor | null, raw: z.input<typeof sourcingRequestSchema>) {
  const d = sourcingRequestSchema.parse(raw);
  const r = await prisma.sourcingRequest.create({
    data: {
      reference: newSourcingRef(), userId: actor?.userId, contactName: d.contactName, contactEmail: d.contactEmail, contactPhone: d.contactPhone || null,
      make: d.make, model: d.model, yearMin: d.yearMin, yearMax: d.yearMax, trim: d.trim || null, maxMileage: d.maxMileage ?? null,
      budgetMax: new D(d.budgetMax), preferredCountries: d.preferredCountries, fuelType: d.fuelType || null, transmission: d.transmission || null, notes: d.notes || null,
    },
  });
  await audit(prisma, { actor, action: "sourcing.requested", entityType: "SourcingRequest", entityId: r.id, summary: `${d.make} ${d.model} ${d.yearMin}-${d.yearMax}` });
  await notifyRole(prisma, "OPERATIONS", { templateKey: "order.milestone", dedupeKey: `sourcing:${r.id}`, vars: { orderNumber: r.reference, milestone: "New sourcing request", description: `${d.make} ${d.model}` } });
  return r;
}

export const offerSchema = z.object({
  vehicleDescription: z.string().trim().min(10).max(500),
  year: z.coerce.number().int().min(1990).max(2100),
  mileage: z.coerce.number().int().min(0).optional(),
  sourceCountry: z.string().trim().length(2).toUpperCase(),
  vehiclePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  vehicleCurrency: z.enum(["NGN", "USD", "EUR", "GBP", "CAD", "AED", "JPY"]),
  engineCapacityCc: z.coerce.number().int().optional(),
  shippingMethod: z.enum(["RORO", "CONTAINER"]).default("RORO"),
  timelineNotes: z.string().trim().min(5).max(1000),
  conditionNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  validDays: z.coerce.number().int().min(1).max(30).default(7),
});

export async function submitOffer(actor: Actor, requestId: string, raw: z.input<typeof offerSchema>, dealerOrgId: string | null) {
  requirePermission(actor, "sourcing.offer");
  const d = offerSchema.parse(raw);
  if (dealerOrgId) {
    if (!actor.dealerOrgIds.includes(dealerOrgId)) throw forbidden();
    const org = await prisma.dealerOrganization.findUniqueOrThrow({ where: { id: dealerOrgId } });
    if (org.status !== "APPROVED") throw precondition("Only approved dealers can submit offers.");
  } else if (!can(actor, "order.transition.ops")) throw forbidden("Platform offers are submitted by operations.");
  const req = await prisma.sourcingRequest.findUnique({ where: { id: requestId } });
  if (!req) throw notFound("Sourcing request");
  if (!["OPEN", "OFFERS_RECEIVED"].includes(req.status)) throw precondition("This request is no longer accepting offers.");
  const offer = await prisma.sourcingOffer.create({
    data: {
      requestId, dealerOrgId, submittedById: actor.userId, vehicleDescription: d.vehicleDescription, year: d.year, mileage: d.mileage ?? null, sourceCountry: d.sourceCountry,
      vehiclePrice: new D(d.vehiclePrice), vehicleCurrency: d.vehicleCurrency, engineCapacityCc: d.engineCapacityCc ?? null, shippingMethod: d.shippingMethod,
      timelineNotes: d.timelineNotes, conditionNotes: d.conditionNotes || null, validUntil: new Date(Date.now() + d.validDays * 86400_000),
    },
  });
  await prisma.sourcingRequest.update({ where: { id: requestId }, data: { status: "OFFERS_RECEIVED" } });
  await audit(prisma, { actor, action: "sourcing.offer_submitted", entityType: "SourcingOffer", entityId: offer.id, summary: `Offer on ${req.reference}` });
  if (req.userId) await notify(prisma, { userId: req.userId, templateKey: "sourcing.offer", dedupeKey: `offer:${offer.id}`, vars: { reference: req.reference, vehicle: d.vehicleDescription }, link: "/account/sourcing" });
  return offer;
}

export async function declineOffer(actor: Actor, offerId: string) {
  const o = await prisma.sourcingOffer.findUnique({ where: { id: offerId }, include: { request: true } });
  if (!o || o.request.userId !== actor.userId) throw notFound("Offer");
  await prisma.sourcingOffer.update({ where: { id: offerId }, data: { status: "DECLINED" } });
}

export async function cancelSourcingRequest(actor: Actor, requestId: string) {
  const r = await prisma.sourcingRequest.findUnique({ where: { id: requestId } });
  if (!r || r.userId !== actor.userId) throw notFound("Request");
  await prisma.sourcingRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
}
