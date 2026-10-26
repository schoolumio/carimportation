import type { Quote, QuoteLineItem } from "@prisma/client";
import { prisma, type DbClient } from "@/server/db";
import { newQuoteNumber } from "@/lib/ids";
import { notFound, precondition, forbidden } from "@/lib/errors";
import { getConfig } from "@/server/admin/config";
import { estimateDelivery, estimateForVehicle, listingToCostInput } from "@/server/pricing/service";
import type { LandedCostResult } from "@/server/pricing/calculator";
import type { Actor } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify } from "@/server/notifications/notify";
import { formatMoney } from "@/lib/money";

async function persistQuote(
  db: DbClient,
  args: { result: LandedCostResult; listingId?: string; sourcingOfferId?: string; buyerId?: string | null; etaMin: number; etaMax: number },
) {
  const hours = await getConfig("quotes.validityHours", db);
  const termsVersion = await getConfig("quotes.termsVersion", db);
  const r = args.result;
  const fxPrimary = r.fxUsed[0];
  return db.quote.create({
    data: {
      quoteNumber: newQuoteNumber(), type: r.quoteType, listingId: args.listingId, sourcingOfferId: args.sourcingOfferId, buyerId: args.buyerId ?? null,
      currency: "NGN", vehicleSubtotal: r.subtotals.vehicle, logisticsSubtotal: r.subtotals.logistics, taxesSubtotal: r.subtotals.taxes,
      feesSubtotal: r.subtotals.fees, contingency: r.subtotals.contingency, totalEstimate: r.total, lowEstimate: r.low, highEstimate: r.high,
      payableNow: r.payableNow, payableLater: r.payableLater, fxSnapshotId: fxPrimary?.snapshotId ?? null, fxRate: fxPrimary?.rateToNGN ?? null,
      etaMinDays: args.etaMin, etaMaxDays: args.etaMax, assumptions: r.assumptions, exclusions: r.exclusions,
      usesUnverifiedRules: r.usesUnverifiedRules, validUntil: new Date(Date.now() + hours * 3600_000), termsVersion,
      lineItems: {
        create: r.lines.map((l) => ({
          code: l.code, label: l.label, category: l.category, amount: l.amount, lowAmount: l.lowAmount, highAmount: l.highAmount,
          currency: l.currency, originalAmount: l.originalAmount, originalCurrency: l.originalCurrency, nature: l.nature,
          calculation: l.calculation, ruleId: l.ruleId, ruleVersion: l.ruleVersion, ruleVerified: l.ruleVerified,
          applicableDate: l.applicableDate, payableStage: l.payableStage, refundable: l.refundable, beneficiary: l.beneficiary,
          optional: l.optional, sortOrder: l.sortOrder,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

export function isOrderable(listing: { status: string; availability: string; expiresAt: Date | null }) {
  return listing.status === "PUBLISHED" && !["RESERVED", "SOLD"].includes(listing.availability) && (!listing.expiresAt || listing.expiresAt > new Date());
}

export async function createQuoteForListing(actor: Actor | null, listingId: string, opts: { selectedOptional?: string[] } = {}) {
  const listing = await prisma.vehicleListing.findUnique({ where: { id: listingId }, include: { spec: true } });
  if (!listing) throw notFound("Listing");
  if (!isOrderable(listing)) throw precondition("This vehicle is not currently available for quotes.");
  const result = await estimateForVehicle(listingToCostInput(listing), { selectedOptional: opts.selectedOptional });
  const eta = await estimateDelivery(listing);
  const quote = await persistQuote(prisma, { result, listingId, buyerId: actor?.userId ?? null, etaMin: eta.minDays, etaMax: eta.maxDays });
  await audit(prisma, { actor, action: "quote.issued", entityType: "Quote", entityId: quote.id, summary: `${quote.type} quote ${quote.quoteNumber} for listing ${listing.publicRef}: ${quote.totalEstimate.toFixed(2)} NGN` });
  if (actor) {
    await notify(prisma, { userId: actor.userId, templateKey: "quote.issued", dedupeKey: `quote:${quote.id}`, channels: ["IN_APP"], vars: { quoteNumber: quote.quoteNumber, total: formatMoney(quote.totalEstimate), validUntil: quote.validUntil.toISOString() }, link: `/checkout/${quote.id}` });
  }
  return quote;
}

export async function createQuoteForOffer(actor: Actor, offerId: string) {
  const offer = await prisma.sourcingOffer.findUnique({ where: { id: offerId }, include: { request: true } });
  if (!offer) throw notFound("Offer");
  if (offer.request.userId !== actor.userId) throw forbidden();
  if (offer.status !== "SUBMITTED" || offer.validUntil < new Date()) throw precondition("This offer is no longer available.");
  const result = await estimateForVehicle({
    price: offer.vehiclePrice, currency: offer.vehicleCurrency, sourceCountry: offer.sourceCountry, shippingMethod: offer.shippingMethod,
    engineCapacityCc: offer.engineCapacityCc, year: offer.year, bodyStyle: "Any", listingType: "OVERSEAS_SUPPLIER_STOCK",
    availability: "AVAILABLE_FOR_PURCHASE", dealerFee: new (await import("@/lib/money")).D(0), auctionFeeEstimate: null,
    isDealerListing: !!offer.dealerOrgId, isSourcingOffer: true,
  });
  const eta = await estimateDelivery({ listingType: "OVERSEAS_SUPPLIER_STOCK", availability: "AVAILABLE_FOR_PURCHASE", sourceCountry: offer.sourceCountry });
  const quote = await persistQuote(prisma, { result, sourcingOfferId: offer.id, buyerId: actor.userId, etaMin: eta.minDays, etaMax: eta.maxDays });
  await audit(prisma, { actor, action: "quote.issued", entityType: "Quote", entityId: quote.id, summary: `Sourcing quote ${quote.quoteNumber} for offer ${offer.id}` });
  return quote;
}

/** Marks a quote expired if its validity has passed. Returns true if (now) expired. */
export async function expireIfStale(quote: Pick<Quote, "id" | "status" | "validUntil">, db: DbClient = prisma): Promise<boolean> {
  if (quote.status === "ISSUED" && quote.validUntil <= new Date()) {
    await db.quote.update({ where: { id: quote.id }, data: { status: "EXPIRED" } });
    return true;
  }
  return quote.status === "EXPIRED";
}

export async function expireStaleQuotes(db: DbClient = prisma) {
  const res = await db.quote.updateMany({ where: { status: "ISSUED", validUntil: { lte: new Date() } }, data: { status: "EXPIRED" } });
  return res.count;
}

export async function getQuoteForViewer(actor: Actor | null, quoteId: string) {
  const q = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, listing: { include: { spec: true, dealerOrg: true, media: { orderBy: { sortOrder: "asc" }, take: 1 } } }, sourcingOffer: { include: { request: true } }, order: true },
  });
  if (!q) throw notFound("Quote");
  if (q.buyerId && q.buyerId !== actor?.userId && !actor?.permissions.has("order.view.all")) throw notFound("Quote");
  return q;
}

export type QuoteWithLines = Quote & { lineItems: QuoteLineItem[] };
