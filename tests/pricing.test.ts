import { beforeEach, describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import { calculateLandedCost, type PricingRuleInput, type VehicleCostInput } from "@/server/pricing/calculator";
import { createQuoteForListing, expireStaleQuotes } from "@/server/quotes/service";
import { acceptQuote } from "@/server/orders/service";
import { resetDb, seedPricing, makeUser, makeListing, prisma } from "./helpers";

const rule = (p: Partial<PricingRuleInput>): PricingRuleInput => ({
  id: p.code ?? "r", code: "R", version: 1, label: "Rule", category: "FREIGHT", calcType: "FIXED_AMOUNT", amount: null, currency: null, percent: null,
  conditions: {}, nature: "QUOTED", refundable: false, beneficiary: "SHIPPING_PROVIDER", payableStage: "UPFRONT", uncertaintyPercent: new D(0),
  sourceReference: "test", verified: true, optional: false, sortOrder: 0, ...p,
});
const vehicle = (p: Partial<VehicleCostInput> = {}): VehicleCostInput => ({
  price: new D("10000"), currency: "USD", sourceCountry: "US", shippingMethod: "RORO", engineCapacityCc: 2500, year: 2019, bodyStyle: "Sedan",
  listingType: "PURCHASED_OVERSEAS", availability: "PURCHASED_AWAITING_SHIPMENT", dealerFee: new D(0), auctionFeeEstimate: null, isDealerListing: false, ...p,
});
const fx = new Map([["USD", { currency: "USD", rateToNGN: new D("1500"), snapshotId: "fx1", capturedAt: new Date("2026-10-01"), source: "TEST" }]]);
const opts = { asOf: new Date("2026-10-26"), fxUncertaintyPercent: 5, allowFixedPrice: true };

describe("landed-cost calculator", () => {
  it("computes CIF-based duty and VAT on the dutiable value with exact decimals", () => {
    const rules = [
      rule({ code: "FREIGHT", category: "FREIGHT", calcType: "FIXED_AMOUNT", amount: new D(1200), currency: "USD" }),
      rule({ code: "INS", category: "INSURANCE", calcType: "PERCENT_OF_VEHICLE", percent: new D("1.5"), beneficiary: "INSURER" }),
      rule({ code: "DUTY", category: "CUSTOMS_DUTY", calcType: "PERCENT_OF_CIF", percent: new D(20), nature: "VARIABLE", beneficiary: "GOVERNMENT" }),
      rule({ code: "VAT", category: "VAT", calcType: "PERCENT_OF_DUTIABLE", percent: new D("7.5"), nature: "VARIABLE", beneficiary: "GOVERNMENT" }),
    ];
    const r = calculateLandedCost(vehicle(), rules, fx, opts);
    const get = (c: string) => r.lines.find((l) => l.code === c)!.amount.toFixed(2);
    expect(get("VEHICLE_PRICE")).toBe("15000000.00");
    expect(get("FREIGHT")).toBe("1800000.00");
    expect(get("INS")).toBe("225000.00");
    // CIF = 15,000,000 + 1,800,000 + 225,000 = 17,025,000 → duty 20% = 3,405,000
    expect(get("DUTY")).toBe("3405000.00");
    // VAT 7.5% of (17,025,000 + 3,405,000) = 1,532,250
    expect(get("VAT")).toBe("1532250.00");
    expect(r.total.toFixed(2)).toBe("21962250.00");
    expect(r.quoteType).toBe("ESTIMATED_LANDED_COST");
    expect(r.high.gt(r.total)).toBe(true);
    expect(r.low.lt(r.total)).toBe(true);
  });

  it("never uses floating point: fractional percentages round half-up to kobo", () => {
    const r = calculateLandedCost(vehicle({ price: new D("10000.01"), currency: "NGN" }), [rule({ code: "P", category: "PLATFORM_FEE", calcType: "PERCENT_OF_VEHICLE", percent: new D("2.5"), nature: "FIXED", beneficiary: "PLATFORM" })], fx, opts);
    expect(r.lines.find((l) => l.code === "P")!.amount.toFixed(2)).toBe("250.00"); // 250.00025 → 250.00
    expect(r.total.toFixed(2)).toBe("10250.01");
  });

  it("issues a fixed-price quote only when every line is fixed, verified and in NGN", () => {
    const fixed = calculateLandedCost(vehicle({ currency: "NGN", price: new D("20000000"), listingType: "IN_NIGERIA", availability: "AVAILABLE_LOCAL_DELIVERY" }), [rule({ code: "DEL", category: "LOCAL_DELIVERY", amount: new D(50000), currency: "NGN", nature: "FIXED", beneficiary: "LOCAL_TRANSPORTER" })], fx, opts);
    expect(fixed.quoteType).toBe("FIXED_PRICE");
    expect(fixed.low.equals(fixed.total) && fixed.high.equals(fixed.total)).toBe(true);
    const unverified = calculateLandedCost(vehicle({ currency: "NGN", price: new D("20000000"), listingType: "IN_NIGERIA", availability: "AVAILABLE_LOCAL_DELIVERY" }), [rule({ code: "DEL", category: "LOCAL_DELIVERY", amount: new D(50000), currency: "NGN", nature: "FIXED", verified: false })], fx, opts);
    expect(unverified.quoteType).toBe("ESTIMATED_LANDED_COST");
    expect(unverified.usesUnverifiedRules).toBe(true);
  });

  it("uses a sourcing quote for vehicles not yet purchased and discloses auction uncertainty", () => {
    const r = calculateLandedCost(vehicle({ listingType: "OVERSEAS_AUCTION", availability: "AVAILABLE_FOR_PURCHASE", auctionFeeEstimate: new D(800) }), [], fx, opts);
    expect(r.quoteType).toBe("SOURCING");
    expect(r.lines.some((l) => l.code === "AUCTION_BUYER_FEE")).toBe(true);
    expect(r.assumptions.join(" ")).toMatch(/Auction outcome is uncertain/);
  });

  it("skips categories that do not apply to the vehicle's journey stage", () => {
    const rules = [rule({ code: "FREIGHT", amount: new D(1200), currency: "USD" }), rule({ code: "DUTY", category: "CUSTOMS_DUTY", calcType: "PERCENT_OF_CIF", percent: new D(20), beneficiary: "GOVERNMENT" })];
    const inTransit = calculateLandedCost(vehicle({ listingType: "IN_TRANSIT", availability: "SHIPPED_IN_TRANSIT" }), rules, fx, opts);
    expect(inTransit.lines.map((l) => l.code)).toEqual(["VEHICLE_PRICE", "DUTY"]);
    const local = calculateLandedCost(vehicle({ listingType: "IN_NIGERIA", availability: "AVAILABLE_LOCAL_DELIVERY" }), rules, fx, opts);
    expect(local.lines.map((l) => l.code)).toEqual(["VEHICLE_PRICE"]);
  });

  it("applies rule conditions (engine size, age, country)", () => {
    const rules = [rule({ code: "BIG", category: "LEVY", calcType: "FIXED_AMOUNT", amount: new D(1000), currency: "NGN", beneficiary: "GOVERNMENT", conditions: { minEngineCc: 3000 } })];
    expect(calculateLandedCost(vehicle(), rules, fx, opts).lines.some((l) => l.code === "BIG")).toBe(false);
    expect(calculateLandedCost(vehicle({ engineCapacityCc: 3500 }), rules, fx, opts).lines.some((l) => l.code === "BIG")).toBe(true);
  });

  it("fails loudly when an exchange-rate snapshot is missing", () => {
    expect(() => calculateLandedCost(vehicle({ currency: "EUR" }), [], fx, opts)).toThrow(/exchange-rate/);
  });

  it("keeps contingency out of the amount payable now", () => {
    const r = calculateLandedCost(vehicle(), [rule({ code: "DUTY", category: "CUSTOMS_DUTY", calcType: "PERCENT_OF_CIF", percent: new D(20), nature: "VARIABLE", beneficiary: "GOVERNMENT" }), rule({ code: "CONT", category: "CONTINGENCY", calcType: "PERCENT_OF_SUBTOTAL", percent: new D(3), nature: "ESTIMATED", beneficiary: "CONTINGENCY_RESERVE", payableStage: "ON_ARRIVAL" })], fx, opts);
    const cont = r.lines.find((l) => l.code === "CONT")!;
    expect(r.payableNow.plus(cont.amount).equals(r.total)).toBe(true);
  });
});

describe("quotes", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricing();
  });

  it("persists itemised quotes with provenance for every line", async () => {
    const admin = await makeUser(["SUPER_ADMIN"]);
    const listing = await makeListing(admin);
    const q = await createQuoteForListing(null, listing.id);
    expect(q.lineItems.length).toBeGreaterThan(4);
    for (const l of q.lineItems) {
      expect(l.calculation.length).toBeGreaterThan(0);
      expect(l.beneficiary).toBeTruthy();
      expect(["FIXED", "QUOTED", "ESTIMATED", "VARIABLE"]).toContain(l.nature);
    }
    expect(q.validUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to accept an expired quote and marks it expired", async () => {
    const admin = await makeUser(["SUPER_ADMIN"]);
    const buyer = await makeUser(["BUYER"]);
    const listing = await makeListing(admin);
    const q = await createQuoteForListing(buyer, listing.id);
    await prisma.quote.update({ where: { id: q.id }, data: { validUntil: new Date(Date.now() - 1000) } });
    await expect(acceptQuote(buyer, q.id, { acceptTerms: true })).rejects.toThrow(/expired/);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("EXPIRED");
    const q2 = await createQuoteForListing(buyer, listing.id);
    await prisma.quote.update({ where: { id: q2.id }, data: { validUntil: new Date(Date.now() - 1000) } });
    expect(await expireStaleQuotes()).toBe(1);
  });

  it("does not quote reserved or unpublished vehicles", async () => {
    const admin = await makeUser(["SUPER_ADMIN"]);
    const listing = await makeListing(admin);
    await prisma.vehicleListing.update({ where: { id: listing.id }, data: { availability: "RESERVED" } });
    await expect(createQuoteForListing(null, listing.id)).rejects.toThrow(/not currently available/);
  });
});
