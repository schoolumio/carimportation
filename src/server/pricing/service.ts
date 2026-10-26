import type { PricingRule, VehicleListing, VehicleSpecification } from "@prisma/client";
import { prisma, type DbClient } from "@/server/db";
import { dec } from "@/lib/money";
import { getConfig } from "@/server/admin/config";
import { calculateLandedCost, type FxRate, type PricingRuleInput, type RuleConditions, type VehicleCostInput } from "./calculator";

export function toRuleInput(r: PricingRule): PricingRuleInput {
  return {
    id: r.id, code: r.code, version: r.version, label: r.label, category: r.category, calcType: r.calcType,
    amount: r.amount, currency: r.currency, percent: r.percent, conditions: (r.conditions ?? {}) as RuleConditions,
    nature: r.nature, refundable: r.refundable, beneficiary: r.beneficiary, payableStage: r.payableStage,
    uncertaintyPercent: r.uncertaintyPercent, sourceReference: r.sourceReference, verified: !!r.verifiedAt,
    optional: r.optional, sortOrder: r.sortOrder,
  };
}

/** Active rules effective at `asOf`; when several versions of a code are effective, the highest version wins. */
export async function activeRules(asOf: Date, db: DbClient = prisma): Promise<PricingRuleInput[]> {
  const rows = await db.pricingRule.findMany({
    where: { active: true, effectiveFrom: { lte: asOf }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }] },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  const seen = new Set<string>();
  const out: PricingRuleInput[] = [];
  for (const r of rows) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    out.push(toRuleInput(r));
  }
  return out;
}

/** Latest exchange-rate snapshot per currency into NGN. */
export async function latestFx(db: DbClient = prisma): Promise<Map<string, FxRate>> {
  const rows = await db.exchangeRateSnapshot.findMany({ where: { quote: "NGN" }, orderBy: { capturedAt: "desc" } });
  const map = new Map<string, FxRate>();
  for (const r of rows) {
    if (map.has(r.base)) continue;
    map.set(r.base, { currency: r.base, rateToNGN: r.rate, snapshotId: r.id, capturedAt: r.capturedAt, source: r.source });
  }
  return map;
}

export function listingToCostInput(l: VehicleListing & { spec: VehicleSpecification | null }): VehicleCostInput {
  return {
    price: l.price, currency: l.priceCurrency, sourceCountry: l.sourceCountry, shippingMethod: l.shippingMethod,
    engineCapacityCc: l.spec?.engineCapacityCc ?? null, year: l.year, bodyStyle: l.bodyStyle, listingType: l.listingType,
    availability: l.availability, dealerFee: dec(l.dealerFee), auctionFeeEstimate: l.auctionFeeEstimate,
    isDealerListing: !!l.dealerOrgId,
  };
}

export async function estimateForVehicle(v: VehicleCostInput, opts: { selectedOptional?: string[]; asOf?: Date } = {}, db: DbClient = prisma) {
  const asOf = opts.asOf ?? new Date();
  const [rules, fx, fxPct, allowFixed] = await Promise.all([
    activeRules(asOf, db), latestFx(db), getConfig("quotes.fxUncertaintyPercent", db), getConfig("quotes.allowFixedPrice", db),
  ]);
  return calculateLandedCost(v, rules, fx, { asOf, selectedOptional: opts.selectedOptional, fxUncertaintyPercent: fxPct, allowFixedPrice: allowFixed });
}

export async function optionalServices(db: DbClient = prisma) {
  const rules = await activeRules(new Date(), db);
  return rules.filter((r) => r.optional);
}

// ─── Delivery estimate ────────────────────────────────────────────────────────

export interface EtaStage { key: string; label: string; min: number; max: number }
export interface EtaEstimate { minDays: number; maxDays: number; stages: EtaStage[]; basis: string[] }

export async function estimateDelivery(
  v: { listingType: VehicleListing["listingType"]; availability: VehicleListing["availability"]; sourceCountry: string; estArrivalStart?: Date | null; estArrivalEnd?: Date | null },
  db: DbClient = prisma,
  now = new Date(),
): Promise<EtaEstimate> {
  const stageDays = await getConfig("eta.stageDays", db);
  const country = await db.sourceCountry.findUnique({ where: { code: v.sourceCountry } });
  const transit: [number, number] = country ? [country.transitDaysMin, country.transitDaysMax] : [30, 60];
  const s = stageDays as Record<string, readonly [number, number]>;
  const stages: EtaStage[] = [];
  const basis: string[] = [];
  const add = (key: string, label: string, r: readonly [number, number]) => stages.push({ key, label, min: r[0], max: r[1] });

  switch (v.listingType) {
    case "OVERSEAS_AUCTION":
      add("sourcing", "Auction bidding & purchase", s.auction);
      add("inspection", "Inspection", s.inspection);
      add("exportPrep", "Export preparation & booking", s.exportPrep);
      add("transit", "Ocean transit to Lagos", transit);
      break;
    case "OVERSEAS_SUPPLIER_STOCK":
      add("sourcing", "Purchase from supplier", s.sourcing);
      add("inspection", "Inspection", s.inspection);
      add("exportPrep", "Export preparation & booking", s.exportPrep);
      add("transit", "Ocean transit to Lagos", transit);
      break;
    case "PURCHASED_OVERSEAS":
      add("inspection", "Inspection", s.inspection);
      if (v.availability === "PURCHASED_AWAITING_EXPORT") add("exportPrep", "Export preparation & booking", s.exportPrep);
      else add("exportPrep", "Awaiting vessel", [3, 10]);
      add("transit", "Ocean transit to Lagos", transit);
      break;
    case "IN_TRANSIT": {
      if (v.estArrivalStart && v.estArrivalEnd) {
        const d = (x: Date) => Math.max(0, Math.ceil((x.getTime() - now.getTime()) / 86400000));
        add("transit", "Remaining transit (seller-declared vessel ETA)", [d(v.estArrivalStart), d(v.estArrivalEnd)]);
        basis.push("Remaining transit uses the seller-declared ETA; it is updated only when evidence is received.");
      } else add("transit", "Remaining transit (estimate)", [Math.round(transit[0] / 2), transit[1]]);
      break;
    }
    default:
      break;
  }
  if (!(v.listingType === "IN_NIGERIA" && v.availability === "AVAILABLE_LOCAL_DELIVERY")) add("clearance", "Port arrival, customs clearance & release", s.clearance);
  add("localDelivery", "Delivery within Lagos", s.localDelivery);

  if (country) basis.push(`Ocean transit from ${country.name}: typically ${transit[0]}–${transit[1]} days (configured operational range, not a carrier guarantee).`);
  basis.push("Clearance time depends on document completeness, customs assessment, examinations and port congestion.");
  return { minDays: stages.reduce((a, b) => a + b.min, 0), maxDays: stages.reduce((a, b) => a + b.max, 0), stages, basis };
}
