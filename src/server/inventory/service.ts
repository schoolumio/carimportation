import type { Availability, ListingStatus, ListingType, Prisma, Provenance } from "@prisma/client";
import { z } from "zod";
import { prisma, transaction } from "@/server/db";
import { newListingRef, slugify } from "@/lib/ids";
import { D } from "@/lib/money";
import { forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify } from "@/server/notifications/notify";
import { getConfig } from "@/server/admin/config";

/** Which availability statuses a seller may declare for each listing type. RESERVED/SOLD are system-managed. */
export const AVAILABILITY_BY_TYPE: Record<ListingType, Availability[]> = {
  OVERSEAS_AUCTION: ["AVAILABLE_FOR_PURCHASE"],
  OVERSEAS_SUPPLIER_STOCK: ["AVAILABLE_FOR_PURCHASE"],
  PURCHASED_OVERSEAS: ["PURCHASED_AWAITING_EXPORT", "PURCHASED_AWAITING_SHIPMENT"],
  IN_TRANSIT: ["SHIPPED_IN_TRANSIT"],
  IN_NIGERIA: ["ARRIVED_AWAITING_CLEARANCE", "AVAILABLE_LOCAL_DELIVERY"],
};

export const LISTING_TYPE_LABEL: Record<ListingType, string> = {
  OVERSEAS_AUCTION: "Overseas auction (purchase on your authorisation)",
  OVERSEAS_SUPPLIER_STOCK: "Overseas supplier stock (purchase on demand)",
  PURCHASED_OVERSEAS: "Already purchased overseas",
  IN_TRANSIT: "Already shipped — in transit",
  IN_NIGERIA: "Already in Nigeria",
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  AVAILABLE_FOR_PURCHASE: "Available for sourcing / purchase on demand",
  PURCHASED_AWAITING_EXPORT: "Purchased — awaiting export",
  PURCHASED_AWAITING_SHIPMENT: "Purchased — awaiting shipment",
  SHIPPED_IN_TRANSIT: "Shipped — in transit",
  ARRIVED_AWAITING_CLEARANCE: "Arrived in Nigeria — awaiting clearance",
  AVAILABLE_LOCAL_DELIVERY: "Available for immediate local delivery",
  RESERVED: "Reserved",
  SOLD: "Sold",
};

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: "Draft", PENDING_REVIEW: "Pending review", CHANGES_REQUESTED: "Changes requested", PUBLISHED: "Published",
  REJECTED: "Rejected", SUSPENDED: "Suspended", EXPIRED: "Expired", SOLD: "Sold", ARCHIVED: "Archived",
};

const optStr = z.string().trim().max(4000).optional().or(z.literal("")).transform((v) => (v ? v : null));
const optDate = z.union([z.date(), z.string()]).optional().nullable().transform((v) => (v ? new Date(v) : null)).refine((v) => v === null || !isNaN(v.getTime()), "Invalid date");

export const listingSchema = z.object({
  listingType: z.enum(["OVERSEAS_AUCTION", "OVERSEAS_SUPPLIER_STOCK", "PURCHASED_OVERSEAS", "IN_TRANSIT", "IN_NIGERIA"]),
  availability: z.enum(["AVAILABLE_FOR_PURCHASE", "PURCHASED_AWAITING_EXPORT", "PURCHASED_AWAITING_SHIPMENT", "SHIPPED_IN_TRANSIT", "ARRIVED_AWAITING_CLEARANCE", "AVAILABLE_LOCAL_DELIVERY"]),
  make: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1990).max(new Date().getUTCFullYear() + 1),
  trim: optStr,
  bodyStyle: z.string().trim().min(2).max(30),
  vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/, "VIN/chassis must be 11–17 characters (no I, O, Q)").optional().or(z.literal("")).transform((v) => v || null),
  vinVisibility: z.enum(["PUBLIC", "MASKED", "BUYERS_WITH_ORDER"]).default("MASKED"),
  mileage: z.coerce.number().int().min(0).max(1_000_000),
  mileageUnit: z.enum(["km", "mi"]).default("km"),
  conditionGrade: optStr,
  conditionSummary: z.string().trim().min(10).max(4000),
  damageDisclosure: optStr,
  previousUse: optStr,
  ownershipInfo: optStr,
  knownDefects: optStr,
  requiredRepairs: optStr,
  sourceName: optStr,
  sourceCountry: z.string().trim().length(2).toUpperCase(),
  currentLocation: z.string().trim().min(2).max(120),
  originPort: optStr,
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount"),
  priceCurrency: z.enum(["NGN", "USD", "EUR", "GBP", "CAD", "AED", "JPY"]),
  dealerFee: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
  shippingMethod: z.enum(["RORO", "CONTAINER", "AIR", "LOCAL_ONLY"]).default("RORO"),
  shipmentWindowStart: optDate,
  shipmentWindowEnd: optDate,
  estArrivalStart: optDate,
  estArrivalEnd: optDate,
  auctionLotNumber: optStr,
  auctionDate: optDate,
  auctionFeeEstimate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")).transform((v) => (v ? v : null)),
  storageDeadline: optDate,
  biddingNotes: optStr,
  cancellationTerms: optStr,
  warrantyText: optStr,
  disclaimer: optStr,
  supplierId: optStr,
  // specification
  engineCapacityCc: z.coerce.number().int().min(0).max(10000).optional().nullable(),
  fuelType: z.string().trim().min(2).max(20),
  transmission: z.string().trim().min(2).max(20),
  drivetrain: optStr,
  steering: z.enum(["LHD", "RHD"]).default("LHD"),
  exteriorColor: optStr,
  interiorColor: optStr,
  doors: z.coerce.number().int().min(1).max(8).optional().nullable(),
  seats: z.coerce.number().int().min(1).max(60).optional().nullable(),
  extras: optStr,
});
export type ListingInput = z.input<typeof listingSchema>;

function validateBusinessRules(d: z.output<typeof listingSchema>) {
  if (!AVAILABILITY_BY_TYPE[d.listingType].includes(d.availability)) {
    throw invalid(`"${AVAILABILITY_LABEL[d.availability]}" is not a valid status for "${LISTING_TYPE_LABEL[d.listingType]}".`);
  }
  if (d.listingType === "OVERSEAS_AUCTION") {
    if (!d.damageDisclosure) throw invalid("Auction listings must disclose known damage (enter 'None known' only if the auction report shows none).");
    if (!d.biddingNotes) throw invalid("Auction listings must explain bidding uncertainty and authorisation conditions.");
  }
  if (d.listingType === "IN_NIGERIA" && d.sourceCountry !== "NG" && !d.currentLocation.toLowerCase().includes("lagos") && !d.currentLocation.toLowerCase().includes("nigeria")) {
    throw invalid("Vehicles in Nigeria must state their current location in Nigeria.");
  }
  if (d.shipmentWindowStart && d.shipmentWindowEnd && d.shipmentWindowEnd < d.shipmentWindowStart) throw invalid("Shipment window end must be after start.");
  if (d.estArrivalStart && d.estArrivalEnd && d.estArrivalEnd < d.estArrivalStart) throw invalid("Arrival estimate end must be after start.");
}

const MATERIAL_FIELDS = ["price", "priceCurrency", "vin", "mileage", "damageDisclosure", "knownDefects", "conditionSummary", "year", "make", "model", "listingType", "availability"];

function splitSpec(d: z.output<typeof listingSchema>) {
  const { engineCapacityCc, fuelType, transmission, drivetrain, steering, exteriorColor, interiorColor, doors, seats, extras, ...listing } = d;
  return { spec: { engineCapacityCc: engineCapacityCc ?? null, fuelType, transmission, drivetrain, steering, exteriorColor, interiorColor, doors: doors ?? null, seats: seats ?? null, extras }, listing };
}

async function assertCanManage(actor: Actor, listing: { dealerOrgId: string | null }) {
  if (can(actor, "listing.manage.all")) return;
  if (listing.dealerOrgId && actor.dealerOrgIds.includes(listing.dealerOrgId) && can(actor, "listing.manage.own")) return;
  throw forbidden("You can only manage your own organisation's listings.");
}

export async function createListing(actor: Actor, raw: ListingInput, opts: { dealerOrgId?: string | null } = {}) {
  const d = listingSchema.parse(raw);
  validateBusinessRules(d);
  let dealerOrgId: string | null = null;
  if (opts.dealerOrgId) {
    if (!actor.dealerOrgIds.includes(opts.dealerOrgId)) throw forbidden();
    requirePermission(actor, "listing.manage.own");
    const org = await prisma.dealerOrganization.findUniqueOrThrow({ where: { id: opts.dealerOrgId } });
    if (org.status !== "APPROVED") throw precondition("Your dealer organisation must be approved before creating listings.");
    dealerOrgId = org.id;
  } else requirePermission(actor, "listing.manage.all");
  const { spec, listing } = splitSpec(d);
  const ref = newListingRef();
  const title = `${d.year} ${d.make} ${d.model}${d.trim ? ` ${d.trim}` : ""}`;
  const created = await prisma.vehicleListing.create({
    data: {
      ...listing, price: new D(listing.price), dealerFee: new D(listing.dealerFee), auctionFeeEstimate: listing.auctionFeeEstimate ? new D(listing.auctionFeeEstimate) : null,
      publicRef: ref, slug: `${slugify(title)}-${ref.toLowerCase()}`, title, supplyChannel: dealerOrgId ? "DEALER" : "PLATFORM_OWNED",
      dealerOrgId, createdById: actor.userId, status: "DRAFT", spec: { create: spec },
    },
  });
  // Seller declarations are recorded as dealer-declared facts; only staff can upgrade provenance.
  for (const field of ["mileage", "condition", "ownership", "vin"]) {
    await prisma.vehicleFactVerification.create({ data: { listingId: created.id, field, provenance: "DEALER_DECLARED", notes: "Declared by seller at listing creation" } });
  }
  await audit(prisma, { actor, action: "listing.created", entityType: "VehicleListing", entityId: created.id, summary: `Listing ${ref} created (${title})` });
  return created;
}

export async function updateListing(actor: Actor, listingId: string, raw: ListingInput) {
  const existing = await prisma.vehicleListing.findUnique({ where: { id: listingId } });
  if (!existing) throw notFound("Listing");
  await assertCanManage(actor, existing);
  if (["RESERVED", "SOLD"].includes(existing.availability)) throw precondition("Reserved or sold listings cannot be edited; contact operations.");
  const d = listingSchema.parse(raw);
  validateBusinessRules(d);
  const { spec, listing } = splitSpec(d);
  const materialChange = MATERIAL_FIELDS.some((f) => String((existing as Record<string, unknown>)[f] ?? "") !== String((listing as Record<string, unknown>)[f] ?? ""));
  const needsReview = existing.status === "PUBLISHED" && materialChange && !can(actor, "listing.moderate");
  const updated = await prisma.vehicleListing.update({
    where: { id: listingId },
    data: {
      ...listing, price: new D(listing.price), dealerFee: new D(listing.dealerFee), auctionFeeEstimate: listing.auctionFeeEstimate ? new D(listing.auctionFeeEstimate) : null,
      title: `${d.year} ${d.make} ${d.model}${d.trim ? ` ${d.trim}` : ""}`,
      ...(needsReview ? { status: "PENDING_REVIEW" as const, moderationNotes: "Material change — re-review required" } : {}),
      spec: { upsert: { create: spec, update: spec } },
    },
  });
  // A changed VIN/mileage invalidates prior verification of that fact.
  if (existing.vin !== listing.vin) await prisma.vehicleFactVerification.updateMany({ where: { listingId, field: "vin" }, data: { provenance: "DEALER_DECLARED", verifiedById: null, notes: "VIN changed by seller" } });
  if (existing.mileage !== listing.mileage) await prisma.vehicleFactVerification.updateMany({ where: { listingId, field: "mileage" }, data: { provenance: "DEALER_DECLARED", verifiedById: null, notes: "Mileage changed by seller" } });
  await audit(prisma, {
    actor, action: "listing.updated", entityType: "VehicleListing", entityId: listingId, summary: `Listing updated${needsReview ? " — sent back for review" : ""}`,
    before: { price: existing.price.toFixed(2), mileage: existing.mileage, vin: existing.vin, availability: existing.availability }, after: { price: listing.price, mileage: listing.mileage, vin: listing.vin, availability: listing.availability },
  });
  return updated;
}

/** Duplicate detection: same VIN on another live listing, or same make/model/year/mileage from the same seller. */
export async function findDuplicates(listingId: string) {
  const l = await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listingId } });
  const live: ListingStatus[] = ["PUBLISHED", "PENDING_REVIEW", "SUSPENDED"];
  const or: Prisma.VehicleListingWhereInput[] = [];
  if (l.vin) or.push({ vin: l.vin });
  or.push({ make: l.make, model: l.model, year: l.year, mileage: l.mileage, dealerOrgId: l.dealerOrgId });
  return prisma.vehicleListing.findMany({ where: { id: { not: l.id }, status: { in: live }, OR: or }, select: { id: true, publicRef: true, title: true, dealerOrgId: true } });
}

export async function submitForReview(actor: Actor, listingId: string) {
  const l = await prisma.vehicleListing.findUnique({ where: { id: listingId }, include: { media: true } });
  if (!l) throw notFound("Listing");
  await assertCanManage(actor, l);
  if (!["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(l.status)) throw precondition("Only drafts or listings with requested changes can be submitted.");
  if (l.media.filter((m) => m.kind === "PHOTO").length < 1) throw precondition("Add at least one photo before submitting.");
  await prisma.vehicleListing.update({ where: { id: listingId }, data: { status: "PENDING_REVIEW" } });
  const dups = await findDuplicates(listingId);
  if (dups.length) {
    await prisma.listingFlag.create({ data: { kind: "DUPLICATE_SUSPECTED", listingId, dealerOrgId: l.dealerOrgId, details: `Possible duplicates: ${dups.map((d) => d.publicRef).join(", ")}` } });
  }
  await audit(prisma, { actor, action: "listing.submitted", entityType: "VehicleListing", entityId: listingId, summary: `Submitted for review${dups.length ? ` (${dups.length} possible duplicates flagged)` : ""}` });
}

export async function moderateListing(actor: Actor, listingId: string, decision: "APPROVE" | "REQUEST_CHANGES" | "REJECT" | "SUSPEND", notes: string) {
  requirePermission(actor, "listing.moderate");
  const l = await prisma.vehicleListing.findUnique({ where: { id: listingId }, include: { dealerOrg: { include: { members: true } } } });
  if (!l) throw notFound("Listing");
  if (l.dealerOrgId && actor.dealerOrgIds.includes(l.dealerOrgId)) throw forbidden("You cannot moderate your own organisation's listing.");
  const openDup = await prisma.listingFlag.count({ where: { listingId, kind: "DUPLICATE_SUSPECTED", status: { in: ["OPEN", "INVESTIGATING"] } } });
  let status: ListingStatus;
  const extra: Prisma.VehicleListingUpdateInput = {};
  switch (decision) {
    case "APPROVE": {
      if (!["PENDING_REVIEW", "SUSPENDED"].includes(l.status)) throw precondition("Listing is not awaiting review.");
      if (openDup) throw precondition("Resolve the open duplicate-listing flag before publishing.");
      if (l.dealerOrg && l.dealerOrg.status !== "APPROVED") throw precondition("Dealer is not approved.");
      const days = await getConfig("listings.defaultExpiryDays");
      status = "PUBLISHED";
      extra.publishedAt = l.publishedAt ?? new Date();
      extra.expiresAt = new Date(Date.now() + days * 86400_000);
      break;
    }
    case "REQUEST_CHANGES":
      status = "CHANGES_REQUESTED";
      break;
    case "REJECT":
      status = "REJECTED";
      break;
    case "SUSPEND":
      status = "SUSPENDED";
      break;
  }
  if (notes.trim().length < 3 && decision !== "APPROVE") throw invalid("Explain the decision to the seller.");
  await prisma.vehicleListing.update({ where: { id: listingId }, data: { status, moderationNotes: notes || null, ...extra } });
  await audit(prisma, { actor, action: "listing.moderated", entityType: "VehicleListing", entityId: listingId, summary: `${decision}: ${notes}` });
  for (const m of l.dealerOrg?.members ?? []) {
    await notify(prisma, { userId: m.userId, templateKey: "listing.status", dedupeKey: `listing:${listingId}:${decision}:${Date.now()}`, vars: { ref: l.publicRef, status: LISTING_STATUS_LABEL[status], notes }, link: `/dealer/listings/${listingId}` });
  }
}

/** Staff-only: record that a listing fact was independently substantiated, with evidence. Dealers cannot do this. */
export async function verifyFact(actor: Actor, listingId: string, field: string, provenance: Provenance, documentId: string | null, notes?: string) {
  requirePermission(actor, "listing.moderate");
  const l = await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listingId } });
  if (l.dealerOrgId && actor.dealerOrgIds.includes(l.dealerOrgId)) throw forbidden();
  if ((provenance === "PLATFORM_VERIFIED" || provenance === "INDEPENDENT_REPORT") && !documentId) throw invalid("Verified facts must reference supporting evidence.");
  if (documentId) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc || doc.listingId !== listingId) throw precondition("Evidence must be attached to this listing.");
  }
  await prisma.vehicleFactVerification.upsert({
    where: { listingId_field: { listingId, field } },
    create: { listingId, field, provenance, documentId, verifiedById: actor.userId, notes },
    update: { provenance, documentId, verifiedById: actor.userId, verifiedAt: new Date(), notes },
  });
  await audit(prisma, { actor, action: "listing.fact_verified", entityType: "VehicleListing", entityId: listingId, summary: `${field} → ${provenance}` });
}

export async function recordInspection(actor: Actor, listingId: string, input: { inspectorName: string; inspectorType: "INDEPENDENT" | "PLATFORM" | "DEALER" | "AUCTION_HOUSE"; grade?: string; summary: string; passed?: boolean; reportDocumentId: string; inspectedAt: Date; orderId?: string }) {
  const l = await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listingId } });
  const staff = can(actor, "listing.moderate");
  if (!staff) await assertCanManage(actor, l);
  if (!staff && input.inspectorType !== "DEALER") throw forbidden("Sellers can only record their own (dealer) inspections. Independent inspections are recorded by staff.");
  const doc = await prisma.document.findUnique({ where: { id: input.reportDocumentId } });
  if (!doc || (doc.listingId !== listingId && doc.orderId !== input.orderId)) throw precondition("Attach the inspection report to this listing first.");
  const insp = await prisma.vehicleInspection.create({ data: { ...input, listingId, recordedById: actor.userId, platformReviewed: staff, reviewedById: staff ? actor.userId : null } });
  await prisma.vehicleListing.update({ where: { id: listingId }, data: { inspectedAt: input.inspectedAt } });
  await audit(prisma, { actor, action: "listing.inspection_recorded", entityType: "VehicleListing", entityId: listingId, summary: `${input.inspectorType} inspection by ${input.inspectorName}` });
  return insp;
}

export async function addMedia(actor: Actor, listingId: string, input: { kind: "PHOTO" | "VIDEO"; url: string; caption?: string }) {
  const l = await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listingId } });
  await assertCanManage(actor, l);
  if (!/^\/api\/media\/[\w.-]+$/.test(input.url) && !input.url.startsWith("illustration:")) throw invalid("Media must be uploaded through the platform.");
  const count = await prisma.vehicleMedia.count({ where: { listingId } });
  if (count >= 40) throw precondition("Maximum of 40 media items per listing.");
  return prisma.vehicleMedia.create({ data: { listingId, kind: input.kind, url: input.url, caption: input.caption, sortOrder: count } });
}

export async function removeMedia(actor: Actor, mediaId: string) {
  const m = await prisma.vehicleMedia.findUniqueOrThrow({ where: { id: mediaId }, include: { listing: true } });
  await assertCanManage(actor, m.listing);
  await prisma.vehicleMedia.delete({ where: { id: mediaId } });
}

// ─── Public search ──────────────────────────────────────────────────────────

export const searchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  make: z.string().trim().max(40).optional(),
  model: z.string().trim().max(60).optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  priceMax: z.coerce.number().optional(),
  mileageMax: z.coerce.number().int().optional(),
  transmission: z.string().max(20).optional(),
  fuelType: z.string().max(20).optional(),
  sourceCountry: z.string().max(2).optional(),
  availability: z.string().max(40).optional(),
  bodyStyle: z.string().max(30).optional(),
  dealer: z.string().max(80).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "year_desc", "mileage_asc"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
});

export async function searchListings(raw: Record<string, string | undefined>) {
  const f = searchSchema.parse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== "")));
  const where: Prisma.VehicleListingWhereInput = {
    status: "PUBLISHED",
    availability: { not: "SOLD" },
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
  const and: Prisma.VehicleListingWhereInput[] = [];
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { make: { contains: f.q, mode: "insensitive" } }, { model: { contains: f.q, mode: "insensitive" } }] });
  if (f.make) and.push({ make: { equals: f.make, mode: "insensitive" } });
  if (f.model) and.push({ model: { contains: f.model, mode: "insensitive" } });
  if (f.yearMin) and.push({ year: { gte: f.yearMin } });
  if (f.yearMax) and.push({ year: { lte: f.yearMax } });
  if (f.mileageMax) and.push({ mileage: { lte: f.mileageMax } });
  if (f.transmission) and.push({ spec: { transmission: { equals: f.transmission, mode: "insensitive" } } });
  if (f.fuelType) and.push({ spec: { fuelType: { equals: f.fuelType, mode: "insensitive" } } });
  if (f.sourceCountry) and.push({ sourceCountry: f.sourceCountry.toUpperCase() });
  if (f.availability) and.push({ availability: f.availability as Availability });
  if (f.bodyStyle) and.push({ bodyStyle: { equals: f.bodyStyle, mode: "insensitive" } });
  if (f.dealer === "platform") and.push({ dealerOrgId: null });
  else if (f.dealer) and.push({ dealerOrg: { slug: f.dealer } });
  if (and.length) where.AND = and;
  const orderBy: Prisma.VehicleListingOrderByWithRelationInput[] =
    f.sort === "price_asc" ? [{ price: "asc" }] : f.sort === "price_desc" ? [{ price: "desc" }] : f.sort === "year_desc" ? [{ year: "desc" }] : f.sort === "mileage_asc" ? [{ mileage: "asc" }] : [{ featured: "desc" }, { publishedAt: "desc" }];
  const pageSize = 12;
  const [items, total] = await Promise.all([
    prisma.vehicleListing.findMany({ where, orderBy, skip: (f.page - 1) * pageSize, take: pageSize, include: { spec: true, media: { orderBy: { sortOrder: "asc" }, take: 1 }, dealerOrg: true, facts: true } }),
    prisma.vehicleListing.count({ where }),
  ]);
  // Price filter is applied in NGN-equivalent terms on the client side of the estimate; here we filter the listing price in its own currency only when NGN.
  const filtered = f.priceMax ? items.filter((i) => i.priceCurrency !== "NGN" || i.price.lte(f.priceMax!)) : items;
  return { items: filtered, total, page: f.page, pages: Math.max(1, Math.ceil(total / pageSize)), filters: f };
}

export async function getPublicListing(slugOrId: string) {
  const l = await prisma.vehicleListing.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }, { publicRef: slugOrId }] },
    include: { spec: true, media: { orderBy: { sortOrder: "asc" } }, dealerOrg: true, supplier: true, inspections: { orderBy: { inspectedAt: "desc" } }, history: true, facts: true },
  });
  if (!l || !["PUBLISHED", "SOLD"].includes(l.status)) return null;
  return l;
}

export function displayVin(l: { vin: string | null; vinVisibility: string }, viewerHasOrder = false) {
  if (!l.vin) return null;
  if (l.vinVisibility === "PUBLIC" || viewerHasOrder) return l.vin;
  if (l.vinVisibility === "MASKED") return `${l.vin.slice(0, 3)}${"•".repeat(Math.max(0, l.vin.length - 7))}${l.vin.slice(-4)}`;
  return "Shared with buyers after order";
}

export async function toggleSaved(actor: Actor, listingId: string) {
  const existing = await prisma.savedVehicle.findUnique({ where: { userId_listingId: { userId: actor.userId, listingId } } });
  if (existing) await prisma.savedVehicle.delete({ where: { userId_listingId: { userId: actor.userId, listingId } } });
  else await prisma.savedVehicle.create({ data: { userId: actor.userId, listingId } });
  return !existing;
}

export async function createInquiry(actor: Actor, listingId: string, message: string) {
  if (message.trim().length < 5) throw invalid("Write a message.");
  const l = await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listingId }, include: { dealerOrg: { include: { members: true } } } });
  const inq = await prisma.inquiry.create({ data: { listingId, buyerId: actor.userId, dealerOrgId: l.dealerOrgId, message: message.trim().slice(0, 2000) } });
  for (const m of l.dealerOrg?.members ?? []) await notify(prisma, { userId: m.userId, templateKey: "inquiry.new", dedupeKey: `inquiry:${inq.id}:${m.userId}`, vars: { listing: l.title, message: inq.message }, link: "/dealer/inquiries" });
  return inq;
}

export async function respondInquiry(actor: Actor, inquiryId: string, response: string) {
  const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiryId }, include: { listing: true } });
  const allowed = (inq.dealerOrgId && actor.dealerOrgIds.includes(inq.dealerOrgId)) || (!inq.dealerOrgId && can(actor, "support.manage"));
  if (!allowed) throw forbidden();
  await prisma.inquiry.update({ where: { id: inquiryId }, data: { response: response.trim().slice(0, 2000), respondedById: actor.userId, respondedAt: new Date(), status: "RESPONDED" } });
  await notify(prisma, { userId: inq.buyerId, templateKey: "inquiry.reply", dedupeKey: `inquiry:${inq.id}:reply:${Date.now()}`, vars: { listing: inq.listing.title, message: response }, link: `/vehicles/${inq.listing.slug}` });
}

export async function reportListing(actor: Actor | null, listingId: string, details: string) {
  if (details.trim().length < 10) throw invalid("Describe the concern.");
  const l = await prisma.vehicleListing.findUniqueOrThrow({ where: { id: listingId } });
  await prisma.listingFlag.create({ data: { kind: "FRAUD_REPORT", listingId, dealerOrgId: l.dealerOrgId, reporterId: actor?.userId, details: details.trim().slice(0, 2000) } });
}

export async function resolveFlag(actor: Actor, flagId: string, status: "ACTIONED" | "DISMISSED", resolution: string) {
  requirePermission(actor, "listing.moderate");
  await prisma.listingFlag.update({ where: { id: flagId }, data: { status, resolution, resolvedById: actor.userId } });
  await audit(prisma, { actor, action: "flag.resolved", entityType: "ListingFlag", entityId: flagId, summary: `${status}: ${resolution}` });
}

export async function expireListings() {
  const res = await prisma.vehicleListing.updateMany({ where: { status: "PUBLISHED", expiresAt: { lt: new Date() }, availability: { notIn: ["RESERVED", "SOLD"] } }, data: { status: "EXPIRED" } });
  return res.count;
}

export async function setFeatured(actor: Actor, listingId: string, featured: boolean, days = 14) {
  requirePermission(actor, "listing.manage.all");
  await prisma.vehicleListing.update({ where: { id: listingId }, data: { featured, featuredUntil: featured ? new Date(Date.now() + days * 86400_000) : null } });
  await audit(prisma, { actor, action: "listing.featured", entityType: "VehicleListing", entityId: listingId, summary: featured ? `Featured for ${days} days` : "Unfeatured" });
}

export async function makeStats() {
  const rows = await prisma.vehicleListing.groupBy({ by: ["make"], where: { status: "PUBLISHED" }, _count: { _all: true }, orderBy: { make: "asc" } });
  return rows.map((r) => ({ make: r.make, count: r._count._all }));
}

export { transaction };
