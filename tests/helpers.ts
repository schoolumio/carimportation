import { dbSchema } from "@/server/db-schema";
import { prisma } from "@/server/db";
import { syncRolesAndPermissions } from "@/server/admin/bootstrap";
import { hashPassword } from "@/server/auth/password";
import { loadActor, type Actor } from "@/server/auth/actor";
import type { RoleKey } from "@/server/auth/permissions";
import { D } from "@/lib/money";
import { resetRateLimits } from "@/server/auth/rate-limit";
import { setStorage, type StorageAdapter } from "@/server/documents/service";
import { uploadDocument } from "@/server/documents/service";
import { drainJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/handlers";

class MemoryStorage implements StorageAdapter {
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) {
    this.files.set(k, d);
  }
  async get(k: string) {
    const f = this.files.get(k);
    if (!f) throw new Error("missing");
    return f;
  }
}

export async function resetDb() {
  if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? "")) throw new Error("resetDb may only run against a *_test database");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname=${dbSchema()} AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${dbSchema()}"."${t.tablename}"`).join(", ")} CASCADE`);
  await syncRolesAndPermissions(prisma);
  resetRateLimits();
  setStorage(new MemoryStorage());
}

let n = 0;
export async function makeUser(roles: RoleKey[], opts: { email?: string; password?: string; verifiedIdentity?: boolean } = {}): Promise<Actor> {
  n++;
  const roleRows = await prisma.role.findMany({ where: { key: { in: roles } } });
  const u = await prisma.user.create({
    data: {
      email: opts.email ?? `user${n}-${Date.now()}@test.local`, fullName: `Test User ${n}`, passwordHash: await hashPassword(opts.password ?? "password-123"),
      roles: { create: roleRows.map((r) => ({ roleId: r.id })) },
      buyerProfile: roles.includes("BUYER") ? { create: { identityStatus: opts.verifiedIdentity === false ? "NOT_STARTED" : "VERIFIED" } } : undefined,
    },
  });
  return (await loadActor(u.id))!;
}

export async function makeDealer(owner?: Actor, status: "APPROVED" | "UNDER_REVIEW" = "APPROVED") {
  const user = owner ?? (await makeUser(["DEALER"]));
  n++;
  const org = await prisma.dealerOrganization.create({
    data: {
      slug: `dealer-${n}-${Date.now()}`, legalName: `Dealer ${n} Ltd`, tradingName: `Dealer ${n}`, businessAddress: "1 Test Rd", city: "Lagos", phone: "08000000000",
      email: `d${n}@test.local`, status, bankAccountVerified: true, members: { create: { userId: user.userId, role: "OWNER" } },
      agreements: { create: { commissionPercent: new D(5), effectiveFrom: new Date(Date.now() - 1000) } },
    },
  });
  return { org, actor: (await loadActor(user.userId))! };
}

export async function seedPricing() {
  const past = new Date(Date.now() - 86400_000);
  await prisma.sourceCountry.createMany({ data: [{ code: "US", name: "United States", originPorts: ["Baltimore"], transitDaysMin: 25, transitDaysMax: 45 }, { code: "CA", name: "Canada", originPorts: ["Halifax"], transitDaysMin: 30, transitDaysMax: 50 }] });
  await prisma.exchangeRateSnapshot.create({ data: { base: "USD", quote: "NGN", rate: new D("1500"), source: "TEST", capturedAt: past } });
  const base = { effectiveFrom: past, sourceReference: "test", verifiedAt: past, conditions: {} };
  await prisma.pricingRule.createMany({
    data: [
      { ...base, code: "FREIGHT_RORO", label: "Freight", category: "FREIGHT", calcType: "FIXED_AMOUNT", amount: new D(1200), currency: "USD", nature: "QUOTED", beneficiary: "SHIPPING_PROVIDER", uncertaintyPercent: new D(10) },
      { ...base, code: "INSURANCE", label: "Insurance", category: "INSURANCE", calcType: "PERCENT_OF_VEHICLE", percent: new D("1.5"), nature: "ESTIMATED", beneficiary: "INSURER" },
      { ...base, code: "DUTY", label: "Duty (test rate)", category: "CUSTOMS_DUTY", calcType: "PERCENT_OF_CIF", percent: new D(20), nature: "VARIABLE", beneficiary: "GOVERNMENT", uncertaintyPercent: new D(15) },
      { ...base, code: "VAT", label: "VAT (test rate)", category: "VAT", calcType: "PERCENT_OF_DUTIABLE", percent: new D("7.5"), nature: "VARIABLE", beneficiary: "GOVERNMENT" },
      { ...base, code: "CLEARING", label: "Clearing", category: "CLEARING", calcType: "FIXED_AMOUNT", amount: new D(350000), currency: "NGN", nature: "QUOTED", beneficiary: "CLEARING_AGENT" },
      { ...base, code: "LOCAL_DELIVERY", label: "Delivery in Lagos", category: "LOCAL_DELIVERY", calcType: "FIXED_AMOUNT", amount: new D(80000), currency: "NGN", nature: "FIXED", beneficiary: "LOCAL_TRANSPORTER" },
      { ...base, code: "PLATFORM_FEE", label: "Platform fee", category: "PLATFORM_FEE", calcType: "PERCENT_OF_VEHICLE", percent: new D(3), nature: "FIXED", beneficiary: "PLATFORM" },
      { ...base, code: "CONTINGENCY", label: "Contingency", category: "CONTINGENCY", calcType: "PERCENT_OF_SUBTOTAL", percent: new D(3), nature: "ESTIMATED", beneficiary: "CONTINGENCY_RESERVE", payableStage: "ON_ARRIVAL" },
    ],
  });
}

export async function makeListing(creator: Actor, opts: { dealerOrgId?: string | null; listingType?: string; availability?: string; price?: string; currency?: string; vin?: string } = {}) {
  n++;
  const ref = `L-T${n}${Date.now() % 100000}`;
  return prisma.vehicleListing.create({
    data: {
      publicRef: ref, slug: `test-${ref.toLowerCase()}`, title: "2019 Toyota Camry", make: "Toyota", model: "Camry", year: 2019, bodyStyle: "Sedan", mileage: 50000,
      conditionSummary: "Good condition", sourceCountry: "US", currentLocation: "Baltimore, MD", price: new D(opts.price ?? "10000"), priceCurrency: opts.currency ?? "USD",
      supplyChannel: opts.dealerOrgId ? "DEALER" : "PLATFORM_OWNED", listingType: (opts.listingType ?? "PURCHASED_OVERSEAS") as never,
      availability: (opts.availability ?? "PURCHASED_AWAITING_SHIPMENT") as never, status: "PUBLISHED", publishedAt: new Date(),
      dealerOrgId: opts.dealerOrgId ?? null, createdById: creator.userId, vin: opts.vin ?? null,
      spec: { create: { fuelType: "Petrol", transmission: "Automatic", engineCapacityCc: 2500 } },
      media: { create: { kind: "PHOTO", url: "illustration:sedan:#1e3a5f" } },
    },
  });
}

export const PDF = Buffer.from("%PDF-1.4 test document");

export async function uploadOrderDoc(actor: Actor, orderId: string, category = "evidence", visibility: "ORDER_PARTIES" | "INTERNAL" | "BUYER_AND_INTERNAL" | "DEALER_AND_INTERNAL" = "ORDER_PARTIES") {
  return uploadDocument(actor, { filename: `${category}.pdf`, mimeType: "application/pdf", data: PDF, category, visibility, orderId });
}

export function runJobs() {
  return drainJobs(JOB_HANDLERS, "test");
}

export { prisma };
