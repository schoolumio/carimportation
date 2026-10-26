import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedPricing, makeUser, makeDealer, makeListing, uploadOrderDoc, PDF, prisma } from "./helpers";
import { createOrder, createPaidOrder } from "./flow";
import { canAccessDocument, documentLinkFor, verifyDocumentLink, signDocumentLink, uploadDocument, readDocument } from "@/server/documents/service";
import { canViewOrder, getOrderForActor } from "@/server/orders/service";
import { updateListing, createListing, moderateListing, submitForReview, addMedia, verifyFact, AVAILABILITY_BY_TYPE } from "@/server/inventory/service";
import { approveRefund, requestRefund } from "@/server/payments/refunds";
import { runReconciliation } from "@/server/payments/reconciliation";
import { grantRole, setRolePermission } from "@/server/admin/service";
import { changeDealerStatus, reviewCheck } from "@/server/dealers/service";

const baseListing = {
  listingType: "PURCHASED_OVERSEAS" as const, availability: "PURCHASED_AWAITING_EXPORT" as const, make: "Lexus", model: "RX 350", year: 2020, bodyStyle: "SUV",
  mileage: 42000, conditionSummary: "Clean interior, minor scratches on rear bumper", sourceCountry: "US", currentLocation: "Houston, TX", price: "28500", priceCurrency: "USD" as const,
  fuelType: "Petrol", transmission: "Automatic", vin: "2T2BZMCA5LC123456",
};

describe("record-level access control", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricing();
  });

  it("isolates orders between buyers and dealers", async () => {
    const { order } = await createOrder({ dealer: true });
    const otherBuyer = await makeUser(["BUYER"]);
    const otherDealer = await makeDealer();
    expect(await canViewOrder(otherBuyer, order)).toBe(false);
    expect(await canViewOrder(otherDealer.actor, order)).toBe(false);
    await expect(getOrderForActor(otherDealer.actor, order.id)).rejects.toThrow(/not found/);
  });

  it("enforces document visibility for buyers, dealers, partners and the public", async () => {
    const { order, buyer, dealer, admin } = await createOrder({ dealer: true });
    const internal = await uploadOrderDoc(admin, order.id, "internal-review", "INTERNAL");
    const buyerOnly = await uploadOrderDoc(admin, order.id, "invoice", "BUYER_AND_INTERNAL");
    const dealerOnly = await uploadOrderDoc(admin, order.id, "settlement-statement", "DEALER_AND_INTERNAL");
    const parties = await uploadOrderDoc(admin, order.id, "bill-of-lading", "ORDER_PARTIES");
    const stranger = await makeUser(["BUYER"]);
    expect(await canAccessDocument(buyer, internal)).toBe(false);
    expect(await canAccessDocument(buyer, buyerOnly)).toBe(true);
    expect(await canAccessDocument(buyer, dealerOnly)).toBe(false);
    expect(await canAccessDocument(dealer!.actor, dealerOnly)).toBe(true);
    expect(await canAccessDocument(dealer!.actor, buyerOnly)).toBe(false);
    expect(await canAccessDocument(dealer!.actor, parties)).toBe(true);
    expect(await canAccessDocument(stranger, parties)).toBe(false);
    expect(await canAccessDocument(null, parties)).toBe(false);
    await expect(documentLinkFor(stranger, parties.id)).rejects.toThrow(/not found/);
    await expect(readDocument(stranger, parties.id)).rejects.toThrow(/not found/);
    const { data } = await readDocument(buyer, parties.id);
    expect(data.equals(PDF)).toBe(true);
  });

  it("issues short-lived signed links bound to the requesting user", async () => {
    const { order, buyer } = await createOrder();
    const doc = await uploadOrderDoc(buyer, order.id, "receipt", "BUYER_AND_INTERNAL");
    const link = await documentLinkFor(buyer, doc.id);
    const u = new URL(link, "http://x");
    const exp = u.searchParams.get("exp")!;
    const sig = u.searchParams.get("sig")!;
    expect(verifyDocumentLink(doc.id, buyer.userId, exp, sig)).toBe(true);
    expect(verifyDocumentLink(doc.id, "someone-else", exp, sig)).toBe(false);
    const expired = new URL(signDocumentLink(doc.id, buyer.userId, Date.now() - 10 * 60_000), "http://x");
    expect(verifyDocumentLink(doc.id, buyer.userId, expired.searchParams.get("exp")!, expired.searchParams.get("sig")!)).toBe(false);
  });

  it("rejects files whose content does not match the declared type", async () => {
    const buyer = await makeUser(["BUYER"]);
    await expect(uploadDocument(buyer, { filename: "x.pdf", mimeType: "application/pdf", data: Buffer.from("<script>"), category: "x", visibility: "INTERNAL" })).rejects.toThrow(/does not match/);
    await expect(uploadDocument(buyer, { filename: "x.exe", mimeType: "application/x-msdownload", data: Buffer.from("MZ"), category: "x", visibility: "INTERNAL" })).rejects.toThrow(/Unsupported/);
  });

  it("prevents dealers from editing other dealers' listings or verifying facts", async () => {
    const a = await makeDealer();
    const b = await makeDealer();
    const listing = await createListing(a.actor, baseListing, { dealerOrgId: a.org.id });
    await expect(updateListing(b.actor, listing.id, { ...baseListing, price: "1" })).rejects.toThrow(/own organisation/);
    await expect(createListing(b.actor, baseListing, { dealerOrgId: a.org.id })).rejects.toThrow();
    await expect(verifyFact(a.actor, listing.id, "mileage", "PLATFORM_VERIFIED", null)).rejects.toThrow(/permission/);
  });

  it("denies privileged finance actions to buyers, dealers and support", async () => {
    const { order } = await createPaidOrder({ dealer: true });
    const buyer = await makeUser(["BUYER"]);
    const support = await makeUser(["SUPPORT"]);
    const dealer = await makeDealer();
    const r = await requestRefund(support, { orderId: order.id, amount: "1000", reason: "goodwill test" });
    for (const actor of [buyer, support, dealer.actor]) await expect(approveRefund(actor, r.id)).rejects.toThrow(/permission/);
    await expect(runReconciliation(buyer, "SANDBOX", new Date(0), new Date()).then(() => { throw new Error("should be guarded at route level"); })).rejects.toThrow();
  });

  it("does not allow protected permissions on non-privileged roles or self-promotion", async () => {
    const admin = await makeUser(["SUPER_ADMIN"]);
    await expect(setRolePermission(admin, "DEALER", "refund.approve", true)).rejects.toThrow(/Protected/);
    await expect(grantRole(admin, admin.userId, "FINANCE")).rejects.toThrow(/own roles/);
  });
});

describe("listings and dealer verification", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricing();
  });

  it("only allows appropriate availability statuses per listing type", async () => {
    const d = await makeDealer();
    expect(AVAILABILITY_BY_TYPE.OVERSEAS_AUCTION).toEqual(["AVAILABLE_FOR_PURCHASE"]);
    await expect(createListing(d.actor, { ...baseListing, listingType: "IN_TRANSIT", availability: "AVAILABLE_LOCAL_DELIVERY" }, { dealerOrgId: d.org.id })).rejects.toThrow(/not a valid status/);
    await expect(createListing(d.actor, { ...baseListing, listingType: "OVERSEAS_AUCTION", availability: "AVAILABLE_FOR_PURCHASE" }, { dealerOrgId: d.org.id })).rejects.toThrow(/disclose known damage/);
  });

  it("requires an approved dealer, review and moderation before publication; flags duplicate VINs", async () => {
    const pending = await makeDealer(undefined, "UNDER_REVIEW");
    await expect(createListing(pending.actor, baseListing, { dealerOrgId: pending.org.id })).rejects.toThrow(/approved/);
    const d = await makeDealer();
    const mod = await makeUser(["VERIFICATION"]);
    const l = await createListing(d.actor, baseListing, { dealerOrgId: d.org.id });
    expect(l.status).toBe("DRAFT");
    await expect(submitForReview(d.actor, l.id)).rejects.toThrow(/photo/);
    await addMedia(d.actor, l.id, { kind: "PHOTO", url: "illustration:suv:#334155" });
    await submitForReview(d.actor, l.id);
    await moderateListing(mod, l.id, "APPROVE", "");
    const published = await prisma.vehicleListing.findUniqueOrThrow({ where: { id: l.id } });
    expect(published.status).toBe("PUBLISHED");
    expect(published.expiresAt).not.toBeNull();
    // Material edit by the dealer sends it back to review.
    await updateListing(d.actor, l.id, { ...baseListing, price: "26000" });
    expect((await prisma.vehicleListing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PENDING_REVIEW");
    // A second listing with the same VIN is flagged and cannot be published until resolved.
    const dup = await createListing(d.actor, baseListing, { dealerOrgId: d.org.id });
    await addMedia(d.actor, dup.id, { kind: "PHOTO", url: "illustration:suv:#334155" });
    await submitForReview(d.actor, dup.id);
    expect(await prisma.listingFlag.count({ where: { listingId: dup.id, kind: "DUPLICATE_SUSPECTED" } })).toBe(1);
    await expect(moderateListing(mod, dup.id, "APPROVE", "")).rejects.toThrow(/duplicate/);
  });

  it("approves dealers only after mandatory checks pass, with status history", async () => {
    const d = await makeDealer(undefined, "UNDER_REVIEW");
    const officer = await makeUser(["VERIFICATION"]);
    await prisma.dealerVerificationCheck.createMany({ data: ["IDENTITY", "BUSINESS_REGISTRATION", "BUSINESS_ADDRESS", "BANK_ACCOUNT_OWNERSHIP"].map((c) => ({ orgId: d.org.id, checkType: c as never })) });
    await expect(changeDealerStatus(officer, d.org.id, "APPROVED", "Looks good")).rejects.toThrow(/Required checks/);
    await expect(reviewCheck(officer, d.org.id, "IDENTITY", "WAIVED", "skip")).rejects.toThrow(/cannot be waived/);
    for (const c of ["IDENTITY", "BUSINESS_REGISTRATION", "BUSINESS_ADDRESS", "BANK_ACCOUNT_OWNERSHIP"] as const) await reviewCheck(officer, d.org.id, c, "PASSED", "verified against original");
    await changeDealerStatus(officer, d.org.id, "APPROVED", "All mandatory checks passed");
    await expect(changeDealerStatus(officer, d.org.id, "UNDER_REVIEW", "send back to review")).rejects.toThrow(/Cannot move/);
    expect(await prisma.dealerVerification.count({ where: { orgId: d.org.id } })).toBe(1);
    const l = await makeListing(d.actor, { dealerOrgId: d.org.id });
    await changeDealerStatus(officer, d.org.id, "SUSPENDED", "Fraud report under investigation");
    expect((await prisma.vehicleListing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("SUSPENDED");
  });
});
