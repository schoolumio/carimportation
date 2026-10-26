import type { DealerStatus, VerificationCheckType } from "@prisma/client";
import { z } from "zod";
import { prisma, transaction } from "@/server/db";
import { slugify, code } from "@/lib/ids";
import { encrypt } from "@/lib/crypto";
import { D } from "@/lib/money";
import { conflict, forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { notify } from "@/server/notifications/notify";
import { hashPassword, passwordPolicyError } from "@/server/auth/password";

export const REQUIRED_CHECKS: VerificationCheckType[] = ["IDENTITY", "BUSINESS_REGISTRATION", "BUSINESS_ADDRESS", "BANK_ACCOUNT_OWNERSHIP"];
export const ALL_CHECKS: VerificationCheckType[] = ["IDENTITY", "BUSINESS_REGISTRATION", "BUSINESS_ADDRESS", "BANK_ACCOUNT_OWNERSHIP", "LICENSE_OR_AUTHORIZATION", "TRADING_HISTORY", "SUPPLIER_RELATIONSHIPS"];

export const DEALER_STATUS_LABEL: Record<DealerStatus, string> = {
  APPLICATION_SUBMITTED: "Application submitted",
  UNDER_REVIEW: "Under review",
  ADDITIONAL_INFO_REQUIRED: "Additional information required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

const ALLOWED_STATUS_CHANGES: Record<DealerStatus, DealerStatus[]> = {
  APPLICATION_SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED"],
  ADDITIONAL_INFO_REQUIRED: ["UNDER_REVIEW", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  SUSPENDED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  REJECTED: [],
};

export const dealerApplicationSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  tradingName: z.string().trim().min(2).max(120),
  registrationNumber: z.string().trim().max(40).optional().or(z.literal("")),
  taxId: z.string().trim().max(40).optional().or(z.literal("")),
  businessAddress: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().length(2).default("NG"),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().toLowerCase().email(),
  website: z.string().trim().url().optional().or(z.literal("")),
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
  sourcingRelationships: z.string().trim().max(2000).optional().or(z.literal("")),
  tradingHistory: z.string().trim().max(2000).optional().or(z.literal("")),
  bankName: z.string().trim().max(80).optional().or(z.literal("")),
  bankAccountName: z.string().trim().max(120).optional().or(z.literal("")),
  bankAccountNumber: z.string().trim().regex(/^\d{10}$/, "NUBAN account numbers have 10 digits").optional().or(z.literal("")),
});

/** Existing user applies to become a dealer. Listing rights are only granted after approval. */
export async function applyAsDealer(actor: Actor, raw: z.infer<typeof dealerApplicationSchema>) {
  const data = dealerApplicationSchema.parse(raw);
  const existing = await prisma.dealerMember.findFirst({ where: { userId: actor.userId } });
  if (existing) throw conflict("You are already a member of a dealer organisation.");
  return transaction(async (tx) => {
    let slug = slugify(data.tradingName) || `dealer-${code(5).toLowerCase()}`;
    if (await tx.dealerOrganization.findUnique({ where: { slug } })) slug = `${slug}-${code(4).toLowerCase()}`;
    const dealerRole = await tx.role.findUniqueOrThrow({ where: { key: "DEALER" } });
    const org = await tx.dealerOrganization.create({
      data: {
        slug, legalName: data.legalName, tradingName: data.tradingName, registrationNumber: data.registrationNumber || null, taxId: data.taxId || null,
        businessAddress: data.businessAddress, city: data.city, state: data.state || null, country: data.country, phone: data.phone, email: data.email,
        website: data.website || null, bio: data.bio || null, sourcingRelationships: data.sourcingRelationships || null, tradingHistory: data.tradingHistory || null,
        bankName: data.bankName || null, bankAccountName: data.bankAccountName || null,
        bankAccountNumberEnc: data.bankAccountNumber ? encrypt(data.bankAccountNumber) : null,
        bankAccountLast4: data.bankAccountNumber ? data.bankAccountNumber.slice(-4) : null,
        members: { create: { userId: actor.userId, role: "OWNER", isAuthorizedRepresentative: true } },
        verifications: { create: { status: "APPLICATION_SUBMITTED", notes: "Application submitted" } },
        checks: { create: ALL_CHECKS.map((c) => ({ checkType: c })) },
      },
    });
    await tx.userRole.upsert({ where: { userId_roleId: { userId: actor.userId, roleId: dealerRole.id } }, create: { userId: actor.userId, roleId: dealerRole.id }, update: {} });
    await audit(tx, { actor, action: "dealer.applied", entityType: "DealerOrganization", entityId: org.id, summary: `Dealer application: ${org.tradingName}` });
    return org;
  });
}

/** Public application flow: creates the user account and the application together. */
export async function registerDealer(input: { fullName: string; email: string; password: string; phone?: string } & z.infer<typeof dealerApplicationSchema>) {
  const pw = passwordPolicyError(input.password);
  if (pw) throw invalid(pw);
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw conflict("An account with this email already exists. Sign in and apply from your account.");
  const buyerRole = await prisma.role.findUniqueOrThrow({ where: { key: "BUYER" } });
  const user = await prisma.user.create({
    data: { email, fullName: input.fullName.trim(), phone: input.phone || input.phone, passwordHash: await hashPassword(input.password), roles: { create: { roleId: buyerRole.id } }, buyerProfile: { create: {} } },
  });
  const { loadActor } = await import("@/server/auth/actor");
  const actor = (await loadActor(user.id))!;
  const org = await applyAsDealer(actor, input);
  return { user, org };
}

export async function submitVerificationDocument(actor: Actor, orgId: string, checkType: VerificationCheckType, documentId: string) {
  if (!actor.dealerOrgIds.includes(orgId)) throw forbidden();
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.dealerOrgId !== orgId) throw precondition("Upload the document to your organisation first.");
  await prisma.dealerVerificationCheck.update({ where: { orgId_checkType: { orgId, checkType } }, data: { status: "SUBMITTED", documentId } });
  await audit(prisma, { actor, action: "dealer.check_submitted", entityType: "DealerOrganization", entityId: orgId, summary: `${checkType} evidence submitted` });
}

export async function reviewCheck(actor: Actor, orgId: string, checkType: VerificationCheckType, status: "PASSED" | "FAILED" | "WAIVED", notes: string) {
  requirePermission(actor, "dealer.verify");
  if (actor.dealerOrgIds.includes(orgId)) throw forbidden("You cannot verify your own organisation.");
  if (status === "WAIVED" && REQUIRED_CHECKS.includes(checkType)) throw precondition("Mandatory checks cannot be waived.");
  await prisma.dealerVerificationCheck.update({ where: { orgId_checkType: { orgId, checkType } }, data: { status, notes, reviewedById: actor.userId, reviewedAt: new Date() } });
  if (checkType === "BANK_ACCOUNT_OWNERSHIP") await prisma.dealerOrganization.update({ where: { id: orgId }, data: { bankAccountVerified: status === "PASSED" } });
  await audit(prisma, { actor, action: "dealer.check_reviewed", entityType: "DealerOrganization", entityId: orgId, summary: `${checkType} → ${status}: ${notes}` });
}

export async function changeDealerStatus(actor: Actor, orgId: string, to: DealerStatus, notes: string) {
  requirePermission(actor, "dealer.verify");
  if (actor.dealerOrgIds.includes(orgId)) throw forbidden("You cannot verify your own organisation.");
  if (notes.trim().length < 5) throw invalid("Add review notes.");
  return transaction(async (tx) => {
    const org = await tx.dealerOrganization.findUnique({ where: { id: orgId }, include: { checks: true, members: true } });
    if (!org) throw notFound("Dealer");
    if (!ALLOWED_STATUS_CHANGES[org.status].includes(to)) throw precondition(`Cannot move from ${DEALER_STATUS_LABEL[org.status]} to ${DEALER_STATUS_LABEL[to]}.`);
    if (to === "APPROVED") {
      const missing = REQUIRED_CHECKS.filter((c) => org.checks.find((x) => x.checkType === c)?.status !== "PASSED");
      if (missing.length) throw precondition(`Required checks not passed: ${missing.join(", ")}`);
    }
    await tx.dealerOrganization.update({
      where: { id: orgId },
      data: { status: to, ...(to === "APPROVED" ? { approvedAt: new Date(), suspendedAt: null } : {}), ...(to === "SUSPENDED" ? { suspendedAt: new Date() } : {}) },
    });
    await tx.dealerVerification.create({ data: { orgId, status: to, notes, reviewerId: actor.userId, requestedInfo: to === "ADDITIONAL_INFO_REQUIRED" ? notes : null } });
    if (to === "SUSPENDED" || to === "REJECTED") {
      await tx.vehicleListing.updateMany({ where: { dealerOrgId: orgId, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } }, data: { status: "SUSPENDED", moderationNotes: `Dealer ${to.toLowerCase()}` } });
    }
    if (to === "APPROVED" && !(await tx.dealerCommercialAgreement.findFirst({ where: { orgId } }))) {
      await tx.dealerCommercialAgreement.create({ data: { orgId, commissionPercent: new D(5), effectiveFrom: new Date(), notes: "Default agreement — adjust per signed contract", createdById: actor.userId } });
    }
    await audit(tx, { actor, action: "dealer.status_changed", entityType: "DealerOrganization", entityId: orgId, summary: `${DEALER_STATUS_LABEL[org.status]} → ${DEALER_STATUS_LABEL[to]}: ${notes}` });
    for (const m of org.members) await notify(tx, { userId: m.userId, templateKey: "dealer.status", dedupeKey: `dealer:${orgId}:status:${to}:${Date.now()}`, vars: { status: DEALER_STATUS_LABEL[to], notes }, link: "/dealer" });
  });
}

export async function setCommercialAgreement(actor: Actor, orgId: string, input: { commissionPercent: string; fixedFeePerSale: string; subscriptionPlan?: string; notes?: string }) {
  requirePermission(actor, "config.manage");
  const pct = new D(input.commissionPercent);
  if (pct.lt(0) || pct.gt(50)) throw invalid("Commission must be between 0% and 50%.");
  const now = new Date();
  await prisma.dealerCommercialAgreement.updateMany({ where: { orgId, effectiveTo: null }, data: { effectiveTo: now } });
  const a = await prisma.dealerCommercialAgreement.create({ data: { orgId, commissionPercent: pct, fixedFeePerSale: new D(input.fixedFeePerSale || "0"), subscriptionPlan: input.subscriptionPlan, notes: input.notes, effectiveFrom: now, createdById: actor.userId } });
  await audit(prisma, { actor, action: "dealer.agreement_set", entityType: "DealerOrganization", entityId: orgId, summary: `Commission ${pct.toFixed(2)}% + ${input.fixedFeePerSale || 0}` });
  return a;
}

/** Performance metrics derived from records (never self-reported). */
export async function dealerMetrics(orgId: string) {
  const [inquiries, responded, completed, cancelled, disputes, upheld, active] = await Promise.all([
    prisma.inquiry.count({ where: { dealerOrgId: orgId } }),
    prisma.inquiry.count({ where: { dealerOrgId: orgId, status: { in: ["RESPONDED", "CLOSED"] } } }),
    prisma.order.count({ where: { dealerOrgId: orgId, state: "COMPLETED" } }),
    prisma.order.count({ where: { dealerOrgId: orgId, state: { in: ["CANCELLED", "REFUNDED"] } } }),
    prisma.dispute.count({ where: { order: { dealerOrgId: orgId } } }),
    prisma.dispute.count({ where: { order: { dealerOrgId: orgId }, outcome: { in: ["FULL_REFUND", "PARTIAL_REFUND", "REMEDIATION"] } } }),
    prisma.vehicleListing.count({ where: { dealerOrgId: orgId, status: "PUBLISHED" } }),
  ]);
  return { inquiries, responseRate: inquiries ? Math.round((responded / inquiries) * 100) : null, completed, cancelled, disputes, upheldComplaints: upheld, activeListings: active };
}
