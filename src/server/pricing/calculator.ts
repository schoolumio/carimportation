// Transparent landed-cost calculator (pure — no database access).
// All arithmetic uses Decimal. Every line records its source rule, nature, beneficiary and stage.
import type { Availability, Beneficiary, CalcType, ChargeNature, ListingType, PayableStage, QuoteType, ShippingMethod } from "@prisma/client";
import { D, type Dec, ZERO, pct, round2, sum } from "@/lib/money";

export const CATEGORY_ORDER = [
  "VEHICLE",
  "DEALER_FEE",
  "ACQUISITION_FEES",
  "OVERSEAS_LOGISTICS",
  "FREIGHT",
  "INSURANCE",
  "CUSTOMS_DUTY",
  "LEVY",
  "VAT",
  "PORT_TERMINAL",
  "CLEARING",
  "LOCAL_DELIVERY",
  "OPTIONAL_SERVICE",
  "PLATFORM_FEE",
  "PAYMENT_PROCESSING",
  "CONTINGENCY",
] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_GROUP: Record<Category, "vehicle" | "logistics" | "taxes" | "fees" | "contingency"> = {
  VEHICLE: "vehicle",
  DEALER_FEE: "fees",
  ACQUISITION_FEES: "logistics",
  OVERSEAS_LOGISTICS: "logistics",
  FREIGHT: "logistics",
  INSURANCE: "logistics",
  PORT_TERMINAL: "logistics",
  LOCAL_DELIVERY: "logistics",
  CUSTOMS_DUTY: "taxes",
  LEVY: "taxes",
  VAT: "taxes",
  CLEARING: "taxes",
  OPTIONAL_SERVICE: "fees",
  PLATFORM_FEE: "fees",
  PAYMENT_PROCESSING: "fees",
  CONTINGENCY: "contingency",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  VEHICLE: "Vehicle price",
  DEALER_FEE: "Dealer fee",
  ACQUISITION_FEES: "Auction & supplier fees",
  OVERSEAS_LOGISTICS: "Overseas inland transport, inspection & storage",
  FREIGHT: "Ocean freight",
  INSURANCE: "Marine insurance",
  CUSTOMS_DUTY: "Customs duty",
  LEVY: "Levies & surcharges",
  VAT: "VAT",
  PORT_TERMINAL: "Port & terminal charges",
  CLEARING: "Clearing agent service",
  LOCAL_DELIVERY: "Local delivery",
  OPTIONAL_SERVICE: "Optional services",
  PLATFORM_FEE: "Platform service fee",
  PAYMENT_PROCESSING: "Payment processing",
  CONTINGENCY: "Contingency (estimate)",
};

export interface RuleConditions {
  sourceCountries?: string[];
  shippingMethods?: ShippingMethod[];
  listingTypes?: ListingType[];
  bodyStyles?: string[];
  minEngineCc?: number;
  maxEngineCc?: number;
  minVehicleAgeYears?: number;
  maxVehicleAgeYears?: number;
  dealerListingsOnly?: boolean;
  platformListingsOnly?: boolean;
}

export interface PricingRuleInput {
  id: string;
  code: string;
  version: number;
  label: string;
  category: string;
  calcType: CalcType;
  amount: Dec | null;
  currency: string | null;
  percent: Dec | null;
  conditions: RuleConditions;
  nature: ChargeNature;
  refundable: boolean;
  beneficiary: Beneficiary;
  payableStage: PayableStage;
  uncertaintyPercent: Dec;
  sourceReference: string;
  verified: boolean;
  optional: boolean;
  sortOrder: number;
}

export interface FxRate {
  currency: string;
  rateToNGN: Dec;
  snapshotId: string | null;
  capturedAt: Date;
  source: string;
}

export interface VehicleCostInput {
  price: Dec;
  currency: string;
  sourceCountry: string;
  shippingMethod: ShippingMethod;
  engineCapacityCc: number | null;
  year: number;
  bodyStyle: string;
  listingType: ListingType;
  availability: Availability;
  dealerFee: Dec;
  auctionFeeEstimate: Dec | null;
  isDealerListing: boolean;
  isSourcingOffer?: boolean;
}

export interface CalcOptions {
  asOf: Date;
  selectedOptional?: string[];
  fxUncertaintyPercent: number;
  allowFixedPrice: boolean;
}

export interface CostLine {
  code: string;
  label: string;
  category: Category;
  amount: Dec; // NGN
  lowAmount: Dec;
  highAmount: Dec;
  currency: "NGN";
  originalAmount: Dec | null;
  originalCurrency: string | null;
  nature: ChargeNature;
  calculation: string;
  ruleId: string | null;
  ruleVersion: number | null;
  ruleVerified: boolean;
  applicableDate: Date;
  payableStage: PayableStage;
  refundable: boolean;
  beneficiary: Beneficiary;
  optional: boolean;
  sortOrder: number;
}

export interface LandedCostResult {
  quoteType: QuoteType;
  currency: "NGN";
  lines: CostLine[];
  subtotals: { vehicle: Dec; logistics: Dec; taxes: Dec; fees: Dec; contingency: Dec };
  total: Dec;
  low: Dec;
  high: Dec;
  payableNow: Dec;
  payableLater: Dec;
  usesUnverifiedRules: boolean;
  assumptions: string[];
  exclusions: string[];
  fxUsed: FxRate[];
}

export const STANDARD_EXCLUSIONS = [
  "Nigerian vehicle registration, number plates and third-party motor insurance.",
  "Repairs, parts or services not disclosed in the listing or quote.",
  "Storage, demurrage or penalties caused by delays in buyer actions or payments.",
  "Changes in government duties, levies or taxes enacted after the quote date (passed through at cost with evidence).",
  "Physical inspection travel costs requested by the buyer.",
];

/** Which cost categories apply given where the vehicle is in its journey. */
export function skippedCategories(listingType: ListingType, availability: Availability): { skip: Category[]; notes: string[] } {
  const overseas: Category[] = ["ACQUISITION_FEES", "OVERSEAS_LOGISTICS", "FREIGHT", "INSURANCE"];
  const nigeria: Category[] = ["CUSTOMS_DUTY", "LEVY", "VAT", "PORT_TERMINAL", "CLEARING"];
  switch (listingType) {
    case "PURCHASED_OVERSEAS":
      return { skip: ["ACQUISITION_FEES"], notes: ["Vehicle already purchased by the seller; acquisition fees are included in the vehicle price."] };
    case "IN_TRANSIT":
      return { skip: overseas, notes: ["Vehicle already shipped; overseas logistics and freight are included in the vehicle price per seller declaration."] };
    case "IN_NIGERIA":
      if (availability === "AVAILABLE_LOCAL_DELIVERY")
        return {
          skip: [...overseas, ...nigeria],
          notes: ["Vehicle is in Nigeria and declared cleared; duties are included in the price. Customs release documents must be provided before delivery."],
        };
      return { skip: overseas, notes: ["Vehicle has arrived in Nigeria; overseas costs and freight are included in the vehicle price."] };
    default:
      return { skip: [], notes: [] };
  }
}

export function ruleApplies(rule: PricingRuleInput, v: VehicleCostInput, asOf: Date): boolean {
  const c = rule.conditions ?? {};
  const age = asOf.getUTCFullYear() - v.year;
  if (c.sourceCountries?.length && !c.sourceCountries.includes(v.sourceCountry)) return false;
  if (c.shippingMethods?.length && !c.shippingMethods.includes(v.shippingMethod)) return false;
  if (c.listingTypes?.length && !c.listingTypes.includes(v.listingType)) return false;
  if (c.bodyStyles?.length && !c.bodyStyles.map((b) => b.toLowerCase()).includes(v.bodyStyle.toLowerCase())) return false;
  if (c.minEngineCc !== undefined && (v.engineCapacityCc ?? 0) < c.minEngineCc) return false;
  if (c.maxEngineCc !== undefined && (v.engineCapacityCc ?? Number.MAX_SAFE_INTEGER) > c.maxEngineCc) return false;
  if (c.minVehicleAgeYears !== undefined && age < c.minVehicleAgeYears) return false;
  if (c.maxVehicleAgeYears !== undefined && age > c.maxVehicleAgeYears) return false;
  if (c.dealerListingsOnly && !v.isDealerListing) return false;
  if (c.platformListingsOnly && v.isDealerListing) return false;
  return true;
}

function toNGN(amount: Dec, currency: string, fx: Map<string, FxRate>, used: Map<string, FxRate>): Dec {
  if (currency === "NGN") return amount;
  const r = fx.get(currency);
  if (!r) throw new Error(`No exchange-rate snapshot available for ${currency}/NGN`);
  used.set(currency, r);
  return amount.times(r.rateToNGN);
}

function band(amount: Dec, uncertaintyPercent: Dec, converted: boolean, fxPct: number, nature: ChargeNature) {
  if (nature === "FIXED" && !converted) return { low: amount, high: amount };
  let u = nature === "FIXED" ? ZERO : uncertaintyPercent;
  if (converted) u = u.plus(fxPct);
  const delta = pct(amount, u);
  const low = amount.minus(delta);
  return { low: round2(low.isNegative() ? ZERO : low), high: round2(amount.plus(delta)) };
}

export function calculateLandedCost(
  v: VehicleCostInput,
  rules: PricingRuleInput[],
  fx: Map<string, FxRate>,
  opts: CalcOptions,
): LandedCostResult {
  if (v.price.lte(0)) throw new Error("Vehicle price must be positive");
  const used = new Map<string, FxRate>();
  const lines: CostLine[] = [];
  const assumptions: string[] = [];
  const { skip, notes } = skippedCategories(v.listingType, v.availability);
  assumptions.push(...notes);

  const vehicleConverted = v.currency !== "NGN";
  const vehicleNGN = round2(toNGN(v.price, v.currency, fx, used));
  const isSourcing = v.isSourcingOffer || v.listingType === "OVERSEAS_AUCTION" || v.listingType === "OVERSEAS_SUPPLIER_STOCK";
  const vehicleNature: ChargeNature = isSourcing ? (v.listingType === "OVERSEAS_AUCTION" ? "VARIABLE" : "QUOTED") : "FIXED";
  const vb = band(vehicleNGN, new D(v.listingType === "OVERSEAS_AUCTION" ? 10 : 0), vehicleConverted, opts.fxUncertaintyPercent, vehicleNature);
  lines.push({
    code: "VEHICLE_PRICE",
    label: v.listingType === "OVERSEAS_AUCTION" ? "Vehicle price (maximum authorised bid)" : "Vehicle price",
    category: "VEHICLE",
    amount: vehicleNGN, lowAmount: vb.low, highAmount: vb.high,
    currency: "NGN",
    originalAmount: vehicleConverted ? v.price : null,
    originalCurrency: vehicleConverted ? v.currency : null,
    nature: vehicleNature,
    calculation: vehicleConverted ? `${v.currency} ${v.price.toFixed(2)} × FX ${used.get(v.currency)!.rateToNGN.toFixed(4)}` : "Listing price",
    ruleId: null, ruleVersion: null, ruleVerified: true,
    applicableDate: opts.asOf,
    payableStage: "UPFRONT", refundable: false,
    beneficiary: v.isDealerListing ? "DEALER" : v.listingType === "OVERSEAS_AUCTION" ? "AUCTION_HOUSE" : "SELLER",
    optional: false, sortOrder: 0,
  });

  if (v.dealerFee.gt(0)) {
    const amt = round2(toNGN(v.dealerFee, v.currency, fx, used));
    const b = band(amt, ZERO, vehicleConverted, opts.fxUncertaintyPercent, "FIXED");
    lines.push({
      code: "DEALER_FEE", label: "Dealer service fee", category: "DEALER_FEE", amount: amt, lowAmount: b.low, highAmount: b.high,
      currency: "NGN", originalAmount: vehicleConverted ? v.dealerFee : null, originalCurrency: vehicleConverted ? v.currency : null,
      nature: "FIXED", calculation: "Set by dealer on listing", ruleId: null, ruleVersion: null, ruleVerified: true,
      applicableDate: opts.asOf, payableStage: "UPFRONT", refundable: false, beneficiary: "DEALER", optional: false, sortOrder: 1,
    });
  }

  if (v.listingType === "OVERSEAS_AUCTION" && v.auctionFeeEstimate && v.auctionFeeEstimate.gt(0) && !skip.includes("ACQUISITION_FEES")) {
    const amt = round2(toNGN(v.auctionFeeEstimate, v.currency, fx, used));
    const b = band(amt, new D(15), vehicleConverted, opts.fxUncertaintyPercent, "ESTIMATED");
    lines.push({
      code: "AUCTION_BUYER_FEE", label: "Auction buyer fee (estimate from listing)", category: "ACQUISITION_FEES", amount: amt,
      lowAmount: b.low, highAmount: b.high, currency: "NGN",
      originalAmount: vehicleConverted ? v.auctionFeeEstimate : null, originalCurrency: vehicleConverted ? v.currency : null,
      nature: "ESTIMATED", calculation: "Auction fee schedule estimate declared on listing; final fee depends on hammer price",
      ruleId: null, ruleVersion: null, ruleVerified: false, applicableDate: opts.asOf, payableStage: "UPFRONT",
      refundable: false, beneficiary: "AUCTION_HOUSE", optional: false, sortOrder: 5,
    });
  }

  const applicable = rules
    .filter((r) => !skip.includes(r.category as Category))
    .filter((r) => CATEGORY_ORDER.includes(r.category as Category))
    .filter((r) => ruleApplies(r, v, opts.asOf))
    .filter((r) => !r.optional || (opts.selectedOptional ?? []).includes(r.code))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category as Category) - CATEGORY_ORDER.indexOf(b.category as Category) || a.sortOrder - b.sortOrder);

  const totalOf = (cats: Category[]) => sum(lines.filter((l) => cats.includes(l.category)).map((l) => l.amount));

  for (const r of applicable) {
    const cat = r.category as Category;
    if (cat === "CONTINGENCY" && lines.every((l) => l.nature === "FIXED")) continue; // nothing uncertain to cover
    let base: Dec | null = null;
    let baseLabel = "";
    let raw: Dec;
    let original: Dec | null = null;
    let originalCurrency: string | null = null;
    switch (r.calcType) {
      case "FIXED_AMOUNT": {
        if (!r.amount || !r.currency) throw new Error(`Rule ${r.code} is missing amount/currency`);
        raw = toNGN(r.amount, r.currency, fx, used);
        if (r.currency !== "NGN") {
          original = r.amount;
          originalCurrency = r.currency;
        }
        break;
      }
      case "PERCENT_OF_VEHICLE":
        base = vehicleNGN;
        baseLabel = "vehicle price";
        raw = pct(base, r.percent ?? 0);
        break;
      case "PERCENT_OF_CIF":
        base = totalOf(["VEHICLE", "FREIGHT", "INSURANCE"]);
        baseLabel = "CIF value (vehicle + freight + insurance)";
        raw = pct(base, r.percent ?? 0);
        break;
      case "PERCENT_OF_DUTIABLE":
        base = totalOf(["VEHICLE", "FREIGHT", "INSURANCE", "CUSTOMS_DUTY", "LEVY"]);
        baseLabel = "CIF + duty + levies";
        raw = pct(base, r.percent ?? 0);
        break;
      case "PERCENT_OF_SUBTOTAL":
        base = sum(lines.filter((l) => l.category !== "CONTINGENCY").map((l) => l.amount));
        baseLabel = "subtotal of preceding charges";
        raw = pct(base, r.percent ?? 0);
        break;
    }
    const amount = round2(raw);
    if (amount.lte(0)) continue;
    const converted = originalCurrency !== null || (base !== null && vehicleConverted);
    const b = band(amount, r.uncertaintyPercent, converted, opts.fxUncertaintyPercent, r.nature);
    lines.push({
      code: r.code, label: r.label, category: cat, amount, lowAmount: b.low, highAmount: b.high, currency: "NGN",
      originalAmount: original, originalCurrency,
      nature: r.nature,
      calculation:
        base !== null
          ? `${r.percent?.toString()}% of ${baseLabel} (₦${base.toFixed(2)}) — ${r.sourceReference}`
          : `${originalCurrency ? `${originalCurrency} ${original!.toFixed(2)} converted` : "Fixed amount"} — ${r.sourceReference}`,
      ruleId: r.id, ruleVersion: r.version, ruleVerified: r.verified,
      applicableDate: opts.asOf, payableStage: r.payableStage, refundable: r.refundable, beneficiary: r.beneficiary,
      optional: r.optional, sortOrder: CATEGORY_ORDER.indexOf(cat) * 100 + r.sortOrder,
    });
  }

  lines.sort((a, b) => a.sortOrder - b.sortOrder);
  const by = (g: string) => sum(lines.filter((l) => CATEGORY_GROUP[l.category] === g).map((l) => l.amount));
  const total = sum(lines.map((l) => l.amount));
  const usesUnverifiedRules = lines.some((l) => !l.ruleVerified);
  const allFixed = lines.every((l) => l.nature === "FIXED");

  let quoteType: QuoteType;
  if (isSourcing) quoteType = "SOURCING";
  else if (opts.allowFixedPrice && allFixed && !usesUnverifiedRules && used.size === 0) quoteType = "FIXED_PRICE";
  else quoteType = "ESTIMATED_LANDED_COST";

  // A fixed-price quote has no band; estimates carry low/high ranges.
  const low = quoteType === "FIXED_PRICE" ? total : sum(lines.filter((l) => l.category !== "CONTINGENCY").map((l) => l.lowAmount));
  const high = quoteType === "FIXED_PRICE" ? total : sum(lines.map((l) => l.highAmount));
  const payableNow = sum(lines.filter((l) => l.payableStage === "UPFRONT").map((l) => l.amount));

  if (used.size) {
    for (const r of used.values())
      assumptions.push(`Exchange rate ${r.currency}/NGN ${r.rateToNGN.toFixed(4)} from ${r.source} captured ${r.capturedAt.toISOString().slice(0, 10)}; actual conversion may differ by about ${opts.fxUncertaintyPercent}%.`);
  }
  if (usesUnverifiedRules)
    assumptions.push("Some charges use rates that have not been verified against current official publications by an administrator. Treat them as indicative only.");
  if (lines.some((l) => l.category === "CUSTOMS_DUTY"))
    assumptions.push("Customs duty, levies and VAT are assessed by the Nigeria Customs Service at clearance and may differ from this estimate.");
  if (v.listingType === "OVERSEAS_AUCTION")
    assumptions.push("Auction outcome is uncertain: the vehicle may sell above the authorised maximum bid, in which case no purchase is made.");
  if (quoteType !== "FIXED_PRICE") assumptions.push("This is not a guaranteed total. Additional charges require your approval unless covered by a disclosed contractual clause.");

  return {
    quoteType, currency: "NGN", lines,
    subtotals: { vehicle: by("vehicle"), logistics: by("logistics"), taxes: by("taxes"), fees: by("fees"), contingency: by("contingency") },
    total, low, high, payableNow, payableLater: total.minus(payableNow),
    usesUnverifiedRules, assumptions, exclusions: STANDARD_EXCLUSIONS, fxUsed: [...used.values()],
  };
}
