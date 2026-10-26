// Demo seed data. EVERYTHING created here is demonstration/test data and is flagged isDemo where the schema allows.
// Pricing rules for government charges are PLACEHOLDERS (unverified) — they are not official tariffs.
// Run on an empty database:  npm run db:seed
import { prisma } from "../src/server/db";
import { syncRolesAndPermissions } from "../src/server/admin/bootstrap";
import { hashPassword } from "../src/server/auth/password";
import { loadActor, type Actor } from "../src/server/auth/actor";
import type { RoleKey } from "../src/server/auth/permissions";
import { D } from "../src/lib/money";
import { encrypt } from "../src/lib/crypto";
import { uploadDocument } from "../src/server/documents/service";
import { createQuoteForListing } from "../src/server/quotes/service";
import { acceptQuote } from "../src/server/orders/service";
import { handlePaymentWebhook } from "../src/server/payments/service";
import { simulateIncomingTransfer } from "../src/server/payments/sandbox";
import { transitionOrder } from "../src/server/orders/engine";
import { ensureShipment, assignPartner, updateBooking, addTrackingEvent, reviseEta, updateCustoms, recordDelivery } from "../src/server/logistics/service";
import { raiseDispute } from "../src/server/disputes/service";
import { requestRelease, approveRelease } from "../src/server/settlement/settlement";
import { createSourcingRequest, submitOffer } from "../src/server/sourcing/service";
import { setConfig } from "../src/server/admin/config";
import { env } from "../src/config/env";

export const DEMO_PASSWORD = "Demo-pass-2026";
const DAY = 86400_000;

function demoPdf(title: string) {
  const text = `DEMO DOCUMENT - TEST DATA ONLY. ${title}. Not a real inspection, invoice or shipping document.`;
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length ${text.length + 40}>>stream\nBT /F1 11 Tf 30 150 Td (${text}) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`);
}

async function user(email: string, fullName: string, roles: RoleKey[], extra: { phone?: string; identity?: boolean } = {}): Promise<Actor> {
  const roleRows = await prisma.role.findMany({ where: { key: { in: roles } } });
  const u = await prisma.user.create({
    data: {
      email, fullName, phone: extra.phone, passwordHash: await hashPassword(DEMO_PASSWORD), isDemo: true, emailVerifiedAt: new Date(),
      roles: { create: roleRows.map((r) => ({ roleId: r.id })) },
      buyerProfile: roles.includes("BUYER") ? { create: { identityStatus: extra.identity ? "VERIFIED" : "NOT_STARTED", city: "Lagos", state: "Lagos", identityType: extra.identity ? "NIN" : null, identityNumberEnc: extra.identity ? encrypt("00000000000") : null } } : undefined,
    },
  });
  return (await loadActor(u.id))!;
}

async function main() {
  env(); // validate secrets up front so a bad .env cannot leave a half-seeded database
  if ((await prisma.user.count()) > 0) {
    console.error("Database already contains users. Seed only runs on an empty database (run `npx prisma migrate reset` yourself on a DEVELOPMENT database if you want to start over).");
    process.exit(1);
  }
  console.log("Seeding demo data (all marked as DEMO/TEST)…");
  await syncRolesAndPermissions(prisma);
  await setConfig(prisma, "kyc.identityRequiredAboveNGN", 0, null);

  // ── Configuration ──
  await prisma.sourceCountry.createMany({
    data: [
      { code: "US", name: "United States", originPorts: ["Baltimore", "Houston", "Newark", "Savannah"], transitDaysMin: 25, transitDaysMax: 45, notes: "Typical RoRo range; verify against carrier schedules." },
      { code: "CA", name: "Canada", originPorts: ["Halifax", "Montreal"], transitDaysMin: 30, transitDaysMax: 50 },
      { code: "BE", name: "Belgium", originPorts: ["Antwerp", "Zeebrugge"], transitDaysMin: 18, transitDaysMax: 30 },
      { code: "DE", name: "Germany", originPorts: ["Bremerhaven", "Hamburg"], transitDaysMin: 20, transitDaysMax: 32 },
      { code: "AE", name: "United Arab Emirates", originPorts: ["Jebel Ali"], transitDaysMin: 28, transitDaysMax: 45 },
      { code: "KR", name: "South Korea", originPorts: ["Incheon", "Busan"], transitDaysMin: 40, transitDaysMax: 60 },
    ],
  });
  await prisma.deliveryLocation.createMany({
    data: [
      { code: "LAGOS-ISLAND", name: "Lagos Island, Ikoyi & Victoria Island", state: "Lagos" },
      { code: "LEKKI-AJAH", name: "Lekki – Ajah corridor", state: "Lagos", localDeliveryDaysMax: 4 },
      { code: "LAGOS-MAINLAND", name: "Lagos Mainland (Ikeja, Yaba, Surulere)", state: "Lagos" },
    ],
  });
  const fxAt = new Date(Date.now() - 2 * DAY);
  await prisma.exchangeRateSnapshot.createMany({
    data: [
      { base: "USD", quote: "NGN", rate: new D("1550"), source: "DEMO RATE — replace with an authorised rate source", capturedAt: fxAt, isDemo: true },
      { base: "EUR", quote: "NGN", rate: new D("1690"), source: "DEMO RATE — replace with an authorised rate source", capturedAt: fxAt, isDemo: true },
      { base: "CAD", quote: "NGN", rate: new D("1130"), source: "DEMO RATE — replace with an authorised rate source", capturedAt: fxAt, isDemo: true },
      { base: "AED", quote: "NGN", rate: new D("422"), source: "DEMO RATE — replace with an authorised rate source", capturedAt: fxAt, isDemo: true },
    ],
  });

  // ── Users ──
  const admin = await user("admin@autovault.test", "Ada Super-Admin (demo)", ["SUPER_ADMIN"]);
  const admin2 = await user("admin2@autovault.test", "Bayo Second-Admin (demo)", ["SUPER_ADMIN"]);
  const ops = await user("ops@autovault.test", "Chidi Operations (demo)", ["OPERATIONS"]);
  const fin1 = await user("finance1@autovault.test", "Funmi Finance Maker (demo)", ["FINANCE"]);
  const fin2 = await user("finance2@autovault.test", "Femi Finance Checker (demo)", ["FINANCE"]);
  await user("verify@autovault.test", "Victoria Verification (demo)", ["VERIFICATION"]);
  await user("support@autovault.test", "Sola Support (demo)", ["SUPPORT"]);
  const logistics = await user("logistics@autovault.test", "Larry Logistics (demo)", ["LOGISTICS_OPERATOR"]);
  const clearing = await user("clearing@autovault.test", "Kemi Clearing Agent (demo)", ["CLEARING_PARTNER"]);
  const driver = await user("delivery@autovault.test", "Dayo Delivery (demo)", ["DELIVERY_PARTNER"]);
  const buyer = await user("buyer@autovault.test", "Ngozi Buyer (demo)", ["BUYER"], { phone: "+2348000000001", identity: true });
  const buyer2 = await user("buyer2@autovault.test", "Tunde Buyer (demo)", ["BUYER"], { phone: "+2348000000002", identity: false });
  const dealerOwner1 = await user("dealer@autovault.test", "Emeka Dealer (demo)", ["DEALER", "BUYER"]);
  const dealerOwner2 = await user("dealer2@autovault.test", "Halima Dealer (demo)", ["DEALER", "BUYER"]);
  const dealerOwner3 = await user("dealer3@autovault.test", "Ibrahim Applicant (demo)", ["DEALER", "BUYER"]);

  // ── Pricing rules ──
  const effectiveFrom = new Date(Date.now() - 30 * DAY);
  const PLACEHOLDER = "DEMO PLACEHOLDER — not an official rate. Verify against the current Nigeria Customs Service tariff / Finance Act and record the citation before live use.";
  const rules = [
    { code: "OVERSEAS_INLAND_US", label: "Inland transport to port (North America)", category: "OVERSEAS_LOGISTICS", calcType: "FIXED_AMOUNT", amount: 450, currency: "USD", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: 20, conditions: { sourceCountries: ["US", "CA"] }, sourceReference: "Demo forwarder rate card (sample)", verified: false },
    { code: "OVERSEAS_INLAND_EU", label: "Inland transport to port (Europe)", category: "OVERSEAS_LOGISTICS", calcType: "FIXED_AMOUNT", amount: 300, currency: "EUR", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: 20, conditions: { sourceCountries: ["BE", "DE"] }, sourceReference: "Demo forwarder rate card (sample)", verified: false },
    { code: "EXPORT_DOCS", label: "Export documentation & title processing", category: "OVERSEAS_LOGISTICS", calcType: "FIXED_AMOUNT", amount: 200, currency: "USD", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: 10, conditions: {}, sourceReference: "Demo forwarder rate card (sample)", verified: false },
    { code: "FREIGHT_RORO_NA", label: "Ocean freight RoRo to Lagos (North America)", category: "FREIGHT", calcType: "FIXED_AMOUNT", amount: 1350, currency: "USD", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: 15, conditions: { sourceCountries: ["US", "CA"], shippingMethods: ["RORO"] }, sourceReference: "Demo carrier tariff (sample) — replace with contracted rates", verified: false },
    { code: "FREIGHT_RORO_EU", label: "Ocean freight RoRo to Lagos (Europe)", category: "FREIGHT", calcType: "FIXED_AMOUNT", amount: 1100, currency: "EUR", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: 15, conditions: { sourceCountries: ["BE", "DE"], shippingMethods: ["RORO"] }, sourceReference: "Demo carrier tariff (sample)", verified: false },
    { code: "FREIGHT_RORO_OTHER", label: "Ocean freight RoRo to Lagos (Middle East / Asia)", category: "FREIGHT", calcType: "FIXED_AMOUNT", amount: 1800, currency: "USD", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: 20, conditions: { sourceCountries: ["AE", "KR"], shippingMethods: ["RORO"] }, sourceReference: "Demo carrier tariff (sample)", verified: false },
    { code: "FREIGHT_CONTAINER", label: "Ocean freight 40ft shared container", category: "FREIGHT", calcType: "FIXED_AMOUNT", amount: 2400, currency: "USD", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: 20, conditions: { shippingMethods: ["CONTAINER"] }, sourceReference: "Demo carrier tariff (sample)", verified: false },
    { code: "MARINE_INSURANCE", label: "Marine insurance (optional, 1.5% of vehicle value)", category: "INSURANCE", calcType: "PERCENT_OF_VEHICLE", percent: "1.5", nature: "QUOTED", beneficiary: "INSURER", conditions: {}, sourceReference: "Demo insurer quote (sample)", verified: false, optional: true },
    { code: "CUSTOMS_IMPORT_DUTY", label: "Customs import duty (placeholder rate)", category: "CUSTOMS_DUTY", calcType: "PERCENT_OF_CIF", percent: "20", nature: "VARIABLE", beneficiary: "GOVERNMENT", uncertaintyPercent: 25, conditions: {}, sourceReference: PLACEHOLDER, verified: false },
    { code: "CUSTOMS_LEVIES", label: "Import levies & surcharges (placeholder rate)", category: "LEVY", calcType: "PERCENT_OF_CIF", percent: "15", nature: "VARIABLE", beneficiary: "GOVERNMENT", uncertaintyPercent: 25, conditions: {}, sourceReference: PLACEHOLDER, verified: false },
    { code: "IMPORT_VAT", label: "VAT on import (placeholder rate)", category: "VAT", calcType: "PERCENT_OF_DUTIABLE", percent: "7.5", nature: "VARIABLE", beneficiary: "GOVERNMENT", uncertaintyPercent: 10, conditions: {}, sourceReference: PLACEHOLDER, verified: false },
    { code: "PORT_TERMINAL", label: "Port, terminal & shipping-line local charges", category: "PORT_TERMINAL", calcType: "FIXED_AMOUNT", amount: 450000, currency: "NGN", nature: "ESTIMATED", beneficiary: "PORT_TERMINAL", uncertaintyPercent: 30, conditions: {}, sourceReference: "Demo estimate — confirm with terminal operator schedules", verified: false },
    { code: "CLEARING_SERVICE", label: "Licensed clearing agent service", category: "CLEARING", calcType: "FIXED_AMOUNT", amount: 350000, currency: "NGN", nature: "QUOTED", beneficiary: "CLEARING_AGENT", uncertaintyPercent: 10, conditions: {}, sourceReference: "Demo clearing partner quote (sample)", verified: false },
    { code: "LOCAL_DELIVERY_LAGOS", label: "Delivery to your address in Lagos", category: "LOCAL_DELIVERY", calcType: "FIXED_AMOUNT", amount: 85000, currency: "NGN", nature: "FIXED", beneficiary: "LOCAL_TRANSPORTER", conditions: {}, sourceReference: "Platform delivery tariff (demo)", verified: true },
    { code: "INDEPENDENT_INSPECTION", label: "Independent pre-shipment inspection (optional)", category: "OPTIONAL_SERVICE", calcType: "FIXED_AMOUNT", amount: 180, currency: "USD", nature: "QUOTED", beneficiary: "PLATFORM", conditions: { listingTypes: ["OVERSEAS_AUCTION", "OVERSEAS_SUPPLIER_STOCK", "PURCHASED_OVERSEAS"] }, sourceReference: "Platform service catalogue (demo)", verified: true, optional: true },
    { code: "REGISTRATION_ASSIST", label: "Registration & plate-number assistance (optional, excludes government fees)", category: "OPTIONAL_SERVICE", calcType: "FIXED_AMOUNT", amount: 60000, currency: "NGN", nature: "FIXED", beneficiary: "PLATFORM", conditions: {}, sourceReference: "Platform service catalogue (demo)", verified: true, optional: true },
    { code: "PLATFORM_SERVICE_FEE", label: "Platform service fee (3% of vehicle price)", category: "PLATFORM_FEE", calcType: "PERCENT_OF_VEHICLE", percent: "3", nature: "FIXED", beneficiary: "PLATFORM", conditions: {}, sourceReference: "Published platform fee schedule (demo)", verified: true },
    { code: "PAYMENT_PROCESSING", label: "Payment processing", category: "PAYMENT_PROCESSING", calcType: "PERCENT_OF_SUBTOTAL", percent: "0.5", nature: "FIXED", beneficiary: "PAYMENT_PROCESSOR", conditions: {}, sourceReference: "Payment partner pricing (demo, to be contracted)", verified: false },
    { code: "CONTINGENCY", label: "Contingency for variable charges (collected only if needed, with approval)", category: "CONTINGENCY", calcType: "PERCENT_OF_SUBTOTAL", percent: "4", nature: "ESTIMATED", beneficiary: "CONTINGENCY_RESERVE", payableStage: "ON_ARRIVAL", conditions: {}, sourceReference: "Platform policy (demo)", verified: true },
  ];
  let order = 0;
  for (const r of rules) {
    await prisma.pricingRule.create({
      data: {
        code: r.code, label: r.label, category: r.category, calcType: r.calcType as never, amount: r.amount !== undefined ? new D(r.amount) : null, currency: r.currency ?? null,
        percent: r.percent ? new D(r.percent) : null, conditions: r.conditions, nature: r.nature as never, beneficiary: r.beneficiary as never,
        payableStage: (r.payableStage ?? "UPFRONT") as never, uncertaintyPercent: new D(r.uncertaintyPercent ?? 0), sourceReference: r.sourceReference,
        optional: r.optional ?? false, effectiveFrom, isDemo: true, createdById: admin.userId, sortOrder: order++,
        verifiedAt: r.verified ? new Date() : null, verifiedById: r.verified ? admin2.userId : null,
      },
    });
  }

  // ── Suppliers ──
  const supAuction = await prisma.supplier.create({ data: { name: "Midwest Vehicle Auction (demo supplier)", type: "AUCTION", country: "US", city: "Chicago", isDemo: true } });
  const supExporter = await prisma.supplier.create({ data: { name: "Scheldt Export Motors (demo supplier)", type: "EXPORTER", country: "BE", city: "Antwerp", isDemo: true } });
  const supDealer = await prisma.supplier.create({ data: { name: "Gulf Coast Pre-Owned (demo supplier)", type: "DEALERSHIP", country: "US", city: "Houston", isDemo: true } });

  // ── Dealers ──
  const mkDealer = async (owner: Actor, d: { slug: string; legal: string; trading: string; city: string; status: "APPROVED" | "UNDER_REVIEW"; bio: string; commission: string }) => {
    const org = await prisma.dealerOrganization.create({
      data: {
        slug: d.slug, legalName: d.legal, tradingName: d.trading, registrationNumber: "RC-DEMO-" + d.slug.slice(0, 4).toUpperCase(), businessAddress: "Demo address, " + d.city, city: d.city, state: "Lagos",
        phone: "+234 800 000 0000", email: `${d.slug}@dealers.autovault.test`, bio: d.bio, status: d.status, approvedAt: d.status === "APPROVED" ? new Date(Date.now() - 90 * DAY) : null,
        bankName: "Demo Bank", bankAccountName: d.legal, bankAccountNumberEnc: encrypt("0123456789"), bankAccountLast4: "6789", bankAccountVerified: d.status === "APPROVED", isDemo: true,
        sourcingRelationships: "Demo: buys from North American auctions and Antwerp exporters.", tradingHistory: "Demo trading history.",
        members: { create: { userId: owner.userId, role: "OWNER", isAuthorizedRepresentative: true } },
        verifications: { create: [{ status: "APPLICATION_SUBMITTED", notes: "Application submitted" }, ...(d.status === "APPROVED" ? [{ status: "APPROVED" as const, notes: "Demo: mandatory checks passed", reviewerId: admin.userId }] : [{ status: "UNDER_REVIEW" as const, notes: "Demo: awaiting CAC certificate review", reviewerId: admin.userId }])] },
        checks: {
          create: ["IDENTITY", "BUSINESS_REGISTRATION", "BUSINESS_ADDRESS", "BANK_ACCOUNT_OWNERSHIP", "LICENSE_OR_AUTHORIZATION", "TRADING_HISTORY", "SUPPLIER_RELATIONSHIPS"].map((c, i) => ({
            checkType: c as never, status: d.status === "APPROVED" ? (i < 4 ? "PASSED" : "SUBMITTED") : i < 2 ? "SUBMITTED" : "NOT_SUBMITTED", notes: d.status === "APPROVED" && i < 4 ? "Demo verification" : null,
          })) as never,
        },
        agreements: { create: { commissionPercent: new D(d.commission), effectiveFrom: new Date(Date.now() - 90 * DAY), notes: "Demo commercial agreement" } },
      },
    });
    return org;
  };
  const dealer1 = await mkDealer(dealerOwner1, { slug: "lekki-motors-import", legal: "Lekki Motors Import Ltd (demo)", trading: "Lekki Motors Import", city: "Lekki", status: "APPROVED", bio: "Demo dealer specialising in North American SUVs and sedans.", commission: "5" });
  const dealer2 = await mkDealer(dealerOwner2, { slug: "harbour-auto-traders", legal: "Harbour Auto Traders Ltd (demo)", trading: "Harbour Auto Traders", city: "Apapa", status: "APPROVED", bio: "Demo dealer importing European vehicles via Antwerp.", commission: "4.5" });
  await mkDealer(dealerOwner3, { slug: "new-dawn-autos", legal: "New Dawn Autos Ltd (demo)", trading: "New Dawn Autos", city: "Ikeja", status: "UNDER_REVIEW", bio: "Demo applicant awaiting verification.", commission: "5" });
  const dealerActor1 = (await loadActor(dealerOwner1.userId))!;

  // ── Listings ──
  type L = {
    make: string; model: string; year: number; trim?: string; body: string; color: string; hex: string; mileage: number; unit?: string; price: string; ccy: string;
    type: string; avail: string; country: string; location: string; port?: string; dealer?: string; supplier?: string; cc: number; fuel: string; trans: string; drive?: string;
    condition: string; damage?: string; defects?: string; repairs?: string; vin?: string; dealerFee?: string; featured?: boolean; auction?: boolean; verified?: string[];
    inspector?: string; inTransit?: boolean;
  };
  const listings: L[] = [
    { make: "Toyota", model: "Camry", year: 2019, trim: "SE", body: "Sedan", color: "Celestial Silver", hex: "#9ca3af", mileage: 61200, unit: "mi", price: "14500", ccy: "USD", type: "PURCHASED_OVERSEAS", avail: "PURCHASED_AWAITING_SHIPMENT", country: "US", location: "Baltimore, MD (port yard)", port: "Baltimore", cc: 2500, fuel: "Petrol", trans: "Automatic", drive: "FWD", condition: "Clean title. Light wear on driver seat bolster. Tyres at ~60%.", defects: "Small chip on windscreen (passenger side).", vin: "4T1B11HK5KU123456", featured: true, verified: ["vin", "mileage"], inspector: "Demo Independent Inspections LLC" },
    { make: "Lexus", model: "RX 350", year: 2020, trim: "F Sport", body: "SUV", color: "Obsidian", hex: "#111827", mileage: 38400, unit: "mi", price: "33900", ccy: "USD", type: "PURCHASED_OVERSEAS", avail: "PURCHASED_AWAITING_EXPORT", country: "US", location: "Houston, TX", port: "Houston", dealer: dealer1.id, supplier: supDealer.id, cc: 3500, fuel: "Petrol", trans: "Automatic", drive: "AWD", condition: "Dealer-declared: very good condition, full service history claimed.", dealerFee: "600", vin: "2T2BZMCA5LC234567", featured: true, verified: ["vin"] },
    { make: "Toyota", model: "Highlander", year: 2018, trim: "XLE", body: "SUV", color: "Blizzard Pearl", hex: "#f3f4f6", mileage: 72100, unit: "mi", price: "21500", ccy: "USD", type: "OVERSEAS_AUCTION", avail: "AVAILABLE_FOR_PURCHASE", country: "US", location: "Chicago, IL (auction yard)", port: "Baltimore", supplier: supAuction.id, cc: 3500, fuel: "Petrol", trans: "Automatic", drive: "AWD", condition: "Auction run-and-drive grade. Not independently inspected.", damage: "Auction report: minor front bumper damage, airbags not deployed.", repairs: "Front bumper respray recommended.", auction: true },
    { make: "Honda", model: "Accord", year: 2018, trim: "Sport", body: "Sedan", color: "Modern Steel", hex: "#4b5563", mileage: 68000, unit: "mi", price: "12800", ccy: "USD", type: "OVERSEAS_SUPPLIER_STOCK", avail: "AVAILABLE_FOR_PURCHASE", country: "US", location: "Newark, NJ (supplier lot)", port: "Newark", dealer: dealer1.id, cc: 1500, fuel: "Petrol", trans: "Automatic", drive: "FWD", condition: "Supplier-declared good condition. Purchased only after your order and payment.", dealerFee: "400" },
    { make: "Mercedes-Benz", model: "GLE 350", year: 2019, trim: "4MATIC", body: "SUV", color: "Polar White", hex: "#fafafa", mileage: 54000, unit: "km", price: "31500", ccy: "EUR", type: "PURCHASED_OVERSEAS", avail: "PURCHASED_AWAITING_SHIPMENT", country: "BE", location: "Antwerp (export terminal)", port: "Antwerp", dealer: dealer2.id, supplier: supExporter.id, cc: 2000, fuel: "Petrol", trans: "Automatic", drive: "AWD", condition: "Dealer-declared: excellent; minor kerb rash on two wheels.", dealerFee: "500", vin: "4JGFB4KB5KA345678", featured: true, verified: ["vin", "mileage"], inspector: "Demo EU Vehicle Check BV" },
    { make: "Volkswagen", model: "Tiguan", year: 2020, trim: "SE", body: "SUV", color: "Platinum Grey", hex: "#6b7280", mileage: 47000, unit: "km", price: "19900", ccy: "EUR", type: "OVERSEAS_SUPPLIER_STOCK", avail: "AVAILABLE_FOR_PURCHASE", country: "DE", location: "Bremen, Germany", port: "Bremerhaven", dealer: dealer2.id, cc: 2000, fuel: "Petrol", trans: "Automatic", drive: "AWD", condition: "Supplier-declared; independent inspection available as an option." },
    { make: "Toyota", model: "Corolla", year: 2020, trim: "LE", body: "Sedan", color: "Super White", hex: "#ffffff", mileage: 41000, unit: "mi", price: "13200", ccy: "USD", type: "IN_TRANSIT", avail: "SHIPPED_IN_TRANSIT", country: "US", location: "At sea — en route to Lagos", port: "Savannah", dealer: dealer1.id, cc: 1800, fuel: "Petrol", trans: "Automatic", drive: "FWD", condition: "Dealer-declared good condition. Bill of lading on file (demo).", dealerFee: "350", vin: "5YFEPRAE1LP456789", inTransit: true },
    { make: "Hyundai", model: "Santa Fe", year: 2019, body: "SUV", color: "Rainforest", hex: "#14532d", mileage: 59000, unit: "km", price: "17500", ccy: "USD", type: "PURCHASED_OVERSEAS", avail: "PURCHASED_AWAITING_EXPORT", country: "KR", location: "Incheon, South Korea", port: "Incheon", cc: 2400, fuel: "Petrol", trans: "Automatic", drive: "AWD", condition: "Platform-owned stock. Export inspection booked.", vin: "KM8J3CA46KU567890" },
    { make: "Ford", model: "Explorer", year: 2018, trim: "XLT", body: "SUV", color: "Magnetic", hex: "#374151", mileage: 80500, unit: "mi", price: "16900", ccy: "USD", type: "OVERSEAS_SUPPLIER_STOCK", avail: "AVAILABLE_FOR_PURCHASE", country: "CA", location: "Toronto, ON", port: "Halifax", cc: 3500, fuel: "Petrol", trans: "Automatic", drive: "4WD", condition: "Supplier-declared. Winter tyres included." },
    { make: "Toyota", model: "RAV4", year: 2021, trim: "XLE Hybrid", body: "SUV", color: "Blueprint", hex: "#1e3a8a", mileage: 29000, unit: "mi", price: "39500000", ccy: "NGN", type: "IN_NIGERIA", avail: "AVAILABLE_LOCAL_DELIVERY", country: "US", location: "Lekki, Lagos (cleared, in showroom)", dealer: dealer1.id, cc: 2500, fuel: "Hybrid", trans: "Automatic", drive: "AWD", condition: "Cleared and available in Lagos. Customs release documents on file (demo).", vin: "2T3RWRFV1MW678901", verified: ["vin"] },
    { make: "Lexus", model: "ES 350", year: 2019, body: "Sedan", color: "Nebula Gray", hex: "#64748b", mileage: 51000, unit: "mi", price: "24800", ccy: "USD", type: "IN_NIGERIA", avail: "ARRIVED_AWAITING_CLEARANCE", country: "US", location: "Tin Can Island port, Lagos", cc: 3500, fuel: "Petrol", trans: "Automatic", drive: "FWD", condition: "Arrived; awaiting customs assessment. Platform-owned.", vin: "58ABZ1B15KU789012" },
    { make: "Kia", model: "Sportage", year: 2020, body: "SUV", color: "Snow White", hex: "#f9fafb", mileage: 44000, unit: "km", price: "14900", ccy: "USD", type: "PURCHASED_OVERSEAS", avail: "PURCHASED_AWAITING_SHIPMENT", country: "AE", location: "Jebel Ali free zone", port: "Jebel Ali", cc: 2400, fuel: "Petrol", trans: "Automatic", drive: "FWD", condition: "Platform-owned. GCC-spec.", vin: "KNDPM3AC5L7890123" },
  ];

  const created = [];
  for (const [i, l] of listings.entries()) {
    const ref = `L-DEMO${String(i + 1).padStart(3, "0")}`;
    const title = `${l.year} ${l.make} ${l.model}${l.trim ? " " + l.trim : ""}`;
    const now = Date.now();
    const listing = await prisma.vehicleListing.create({
      data: {
        publicRef: ref, slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ref.toLowerCase()}`, title, make: l.make, model: l.model, year: l.year, trim: l.trim, bodyStyle: l.body,
        supplyChannel: l.dealer ? "DEALER" : "PLATFORM_OWNED", listingType: l.type as never, availability: l.avail as never, status: "PUBLISHED",
        dealerOrgId: l.dealer ?? null, supplierId: l.supplier ?? null, createdById: l.dealer ? dealerOwner1.userId : admin.userId,
        vin: l.vin ?? null, vinVisibility: "MASKED", mileage: l.mileage, mileageUnit: l.unit ?? "km", conditionGrade: l.auction ? "Auction grade 3.5 (demo)" : null,
        conditionSummary: l.condition, damageDisclosure: l.damage ?? (l.auction ? null : "No damage declared by seller."), knownDefects: l.defects, requiredRepairs: l.repairs,
        previousUse: "Private use (seller-declared)", ownershipInfo: "Title/ownership evidence to be verified before purchase (demo).",
        sourceName: l.supplier ? undefined : l.dealer ? "Dealer stock" : "Platform sourcing", sourceCountry: l.country, currentLocation: l.location, originPort: l.port,
        price: new D(l.price), priceCurrency: l.ccy, dealerFee: new D(l.dealerFee ?? "0"), shippingMethod: l.type === "IN_NIGERIA" ? "LOCAL_ONLY" : "RORO",
        shipmentWindowStart: l.type === "PURCHASED_OVERSEAS" ? new Date(now + 7 * DAY) : null, shipmentWindowEnd: l.type === "PURCHASED_OVERSEAS" ? new Date(now + 21 * DAY) : null,
        estArrivalStart: l.inTransit ? new Date(now + 12 * DAY) : null, estArrivalEnd: l.inTransit ? new Date(now + 20 * DAY) : null,
        inspectedAt: l.inspector ? new Date(now - 10 * DAY) : null,
        auctionLotNumber: l.auction ? "LOT-DEMO-4411" : null, auctionDate: l.auction ? new Date(now + 6 * DAY) : null, auctionFeeEstimate: l.auction ? new D("950") : null,
        storageDeadline: l.auction ? new Date(now + 10 * DAY) : null,
        biddingNotes: l.auction ? "You authorise a maximum bid (the vehicle price shown). If the hammer price exceeds it, no purchase is made and unreleased funds are refundable. Auction storage fees apply if the vehicle is not collected by the storage deadline." : null,
        cancellationTerms: l.auction ? "Before the auction, you may cancel without charge. After a successful bid, the auction purchase is binding and costs already incurred are not refundable." : null,
        warrantyText: "No manufacturer warranty. Sold as described; protected by the inspection and dispute process.",
        disclaimer: "DEMO LISTING — test data for demonstration only.",
        featured: l.featured ?? false, publishedAt: new Date(now - (i + 1) * DAY), expiresAt: new Date(now + 60 * DAY), isDemo: true,
        spec: { create: { engineCapacityCc: l.cc, fuelType: l.fuel, transmission: l.trans, drivetrain: l.drive, steering: "LHD", exteriorColor: l.color, interiorColor: "Black", doors: 4, seats: l.body === "SUV" ? 5 : 5 } },
        media: { create: [{ kind: "PHOTO", url: `illustration:${l.body.toLowerCase()}:${l.hex}`, caption: "Illustration (demo — no real photo)", isDemo: true }, { kind: "PHOTO", url: `illustration:${l.body.toLowerCase()}:${l.hex}:rear`, caption: "Illustration (demo)", sortOrder: 1, isDemo: true }] },
        history: { create: [{ kind: "OWNERSHIP", description: "Seller declares one previous owner.", provenance: "DEALER_DECLARED" }, ...(l.damage ? [{ kind: "DAMAGE", description: l.damage, provenance: "INDEPENDENT_REPORT" as const }] : [])] },
      },
    });
    for (const field of ["mileage", "condition", "ownership", "vin"]) {
      await prisma.vehicleFactVerification.create({ data: { listingId: listing.id, field, provenance: "DEALER_DECLARED", notes: "Seller declaration" } });
    }
    if (l.inspector || l.verified?.length) {
      const doc = await uploadDocument(admin, { filename: `inspection-${ref}.pdf`, mimeType: "application/pdf", data: demoPdf(`Inspection report ${ref}`), category: "inspection-report", visibility: "PUBLIC_LISTING", listingId: listing.id });
      await prisma.document.update({ where: { id: doc.id }, data: { isDemo: true, reviewStatus: "ACCEPTED", reviewedById: admin.userId } });
      if (l.inspector) {
        await prisma.vehicleInspection.create({ data: { listingId: listing.id, inspectorName: l.inspector + " (demo)", inspectorType: "INDEPENDENT", grade: "B+", summary: "DEMO inspection: mechanical and body check, no structural damage observed, OBD scan clear.", passed: true, reportDocumentId: doc.id, inspectedAt: new Date(now - 10 * DAY), platformReviewed: true, reviewedById: admin.userId, recordedById: admin.userId, isDemo: true } });
      }
      for (const f of l.verified ?? []) {
        await prisma.vehicleFactVerification.update({ where: { listingId_field: { listingId: listing.id, field: f } }, data: { provenance: l.inspector ? "INDEPENDENT_REPORT" : "PLATFORM_VERIFIED", documentId: doc.id, verifiedById: admin.userId, notes: "Demo verification against report" } });
      }
    }
    created.push(listing);
  }
  // A listing under moderation from the dealer
  await prisma.vehicleListing.create({
    data: {
      publicRef: "L-DEMO099", slug: "2017-toyota-sienna-l-demo099", title: "2017 Toyota Sienna LE", make: "Toyota", model: "Sienna", year: 2017, trim: "LE", bodyStyle: "Minivan",
      supplyChannel: "DEALER", listingType: "PURCHASED_OVERSEAS", availability: "PURCHASED_AWAITING_EXPORT", status: "PENDING_REVIEW", dealerOrgId: dealer1.id, createdById: dealerOwner1.userId,
      mileage: 88000, mileageUnit: "mi", conditionSummary: "Dealer-declared fair condition, sliding door motor replaced.", sourceCountry: "US", currentLocation: "Houston, TX", price: new D("11800"), priceCurrency: "USD",
      isDemo: true, spec: { create: { fuelType: "Petrol", transmission: "Automatic", engineCapacityCc: 3500 } }, media: { create: { kind: "PHOTO", url: "illustration:minivan:#78350f", isDemo: true } },
    },
  });

  // ── Orders through the real workflow (sandbox payments) ──
  const pay = async (orderId: string) => {
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId, purpose: "ORDER_PAYMENT" } });
    const sim = await simulateIncomingTransfer(intent.reference, intent.amount);
    await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
  };
  const doc = async (orderId: string, category: string, visibility: "ORDER_PARTIES" | "BUYER_AND_INTERNAL" = "ORDER_PARTIES") => {
    const d = await uploadDocument(ops, { filename: `${category}.pdf`, mimeType: "application/pdf", data: demoPdf(category), category, visibility, orderId });
    await prisma.document.update({ where: { id: d.id }, data: { isDemo: true } });
    return d.id;
  };

  // Order A: Camry, in transit with tracking & an ETA revision.
  const qA = await createQuoteForListing(buyer, created[0].id);
  const oA = await acceptQuote(buyer, qA.id, { acceptTerms: true, deliveryAddress: "12 Admiralty Way, Lekki Phase 1, Lagos" });
  await pay(oA.id);
  await transitionOrder(ops, oA.id, { to: "INSPECTION_COMPLETED", description: "Independent inspection report reviewed (demo)", evidenceDocumentIds: [await doc(oA.id, "inspection-report")] });
  const sA = await ensureShipment(ops, oA.id, { etaStart: new Date(Date.now() + 18 * DAY), etaEnd: new Date(Date.now() + 26 * DAY) });
  await assignPartner(ops, sA.id, logistics.userId, "LOGISTICS_OPERATOR");
  await assignPartner(ops, sA.id, clearing.userId, "CLEARING_PARTNER");
  await assignPartner(ops, sA.id, driver.userId, "DELIVERY_PARTNER");
  await transitionOrder(logistics, oA.id, { to: "EXPORT_PREPARATION", description: "Vehicle collected to Baltimore port yard; title submitted to customs (demo)" });
  await updateBooking(logistics, sA.id, { bookingRef: "BKG-DEMO-7781", vesselName: "MV Demo Atlantic (test data)", voyageNumber: "026W", billOfLading: "BL-DEMO-55321", plannedDeparture: new Date(Date.now() - 12 * DAY) });
  await transitionOrder(logistics, oA.id, { to: "SHIPMENT_BOOKED", evidenceDocumentIds: [await doc(oA.id, "booking-confirmation")] });
  await transitionOrder(logistics, oA.id, { to: "DEPARTED", description: "Vessel departed Baltimore (demo)", evidenceDocumentIds: [await doc(oA.id, "bill-of-lading")] });
  await transitionOrder(logistics, oA.id, { to: "IN_TRANSIT" });
  await addTrackingEvent(logistics, sA.id, { milestone: "Transhipment call", description: "Vessel called at Tema, Ghana (manual update, demo)", location: "Tema, Ghana", occurredAt: new Date(Date.now() - 2 * DAY) });
  await reviseEta(logistics, sA.id, { newStart: new Date(Date.now() + 21 * DAY), newEnd: new Date(Date.now() + 29 * DAY), reason: "Berthing delay reported at Tema (demo)", supportingInfo: "Carrier schedule notice received by email (demo)" });

  // Order B: awaiting payment (buyer has verified identity).
  const qB = await createQuoteForListing(buyer, created[4].id);
  await acceptQuote(buyer, qB.id, { acceptTerms: true, deliveryAddress: "5 Bourdillon Road, Ikoyi, Lagos" });

  // Order C: local stock delivered & completed, with settlements released (dealer 1).
  const qC = await createQuoteForListing(buyer, created[9].id);
  const oC = await acceptQuote(buyer, qC.id, { acceptTerms: true, deliveryAddress: "12 Admiralty Way, Lekki Phase 1, Lagos" });
  await pay(oC.id);
  await transitionOrder(ops, oC.id, { to: "READY_FOR_HANDOVER", description: "Vehicle prepared at Lekki showroom (demo)" });
  const handover = await doc(oC.id, "handover-note");
  await recordDelivery(ops, oC.id, { recipientName: "Ngozi Buyer (demo)", deliveredAt: new Date(Date.now() - 4 * DAY), evidenceDocumentId: handover, odometerReading: 29010 });
  await transitionOrder(ops, oC.id, { to: "DELIVERED", evidenceDocumentIds: [handover] });
  const { buyerAcceptVehicle } = await import("../src/server/orders/service");
  await buyerAcceptVehicle(buyer, oC.id);
  for (const ins of await prisma.settlementInstruction.findMany({ where: { orderId: oC.id, status: "ELIGIBLE" } })) {
    await requestRelease(fin1, ins.id);
    await approveRelease(fin2, ins.id);
  }

  // Order D: buyer2 (identity not verified) — waiting on compliance.
  const qD = await createQuoteForListing(buyer2, created[7].id);
  await acceptQuote(buyer2, qD.id, { acceptTerms: true, deliveryAddress: "22 Allen Avenue, Ikeja, Lagos" });

  // Order E: dealer order with an open dispute after inspection.
  const qE = await createQuoteForListing(buyer, created[1].id);
  const oE = await acceptQuote(buyer, qE.id, { acceptTerms: true, deliveryAddress: "12 Admiralty Way, Lekki Phase 1, Lagos" });
  await pay(oE.id);
  await transitionOrder(ops, oE.id, { to: "INSPECTION_COMPLETED", evidenceDocumentIds: [await doc(oE.id, "inspection-report")] });
  await raiseDispute(buyer, { orderId: oE.id, category: "UNDISCLOSED_DAMAGE", description: "DEMO: inspection photos show rear quarter panel repair not disclosed in the listing." });

  // Sourcing request with a dealer offer.
  const sr = await createSourcingRequest(buyer, { contactName: "Ngozi Buyer (demo)", contactEmail: "buyer@autovault.test", make: "Toyota", model: "Land Cruiser Prado", yearMin: 2017, yearMax: 2020, budgetMax: "75000000", preferredCountries: ["US", "AE"], notes: "Prefer diesel, 7 seats (demo)" });
  await submitOffer(dealerActor1, sr.id, { vehicleDescription: "2018 Toyota Land Cruiser Prado VX, 7 seats, diesel (demo offer)", year: 2018, mileage: 61000, sourceCountry: "AE", vehiclePrice: "36500", vehicleCurrency: "USD", engineCapacityCc: 2800, shippingMethod: "RORO", timelineNotes: "Purchase within 5 days of payment; next RoRo sailing from Jebel Ali (demo)", conditionNotes: "Supplier-declared accident-free.", validDays: 7 }, dealer1.id);

  console.log("\nDemo seed complete. All accounts use password:", DEMO_PASSWORD);
  console.log("  admin@autovault.test (super admin), ops@, finance1@, finance2@, verify@, support@, logistics@, clearing@, delivery@");
  console.log("  buyer@autovault.test, buyer2@autovault.test, dealer@autovault.test, dealer2@autovault.test, dealer3@autovault.test (applicant)");
  void admin2;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
