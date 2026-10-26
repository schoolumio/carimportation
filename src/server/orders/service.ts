import type { Order, Prisma } from "@prisma/client";
import { prisma, transaction, type Tx } from "@/server/db";
import { newOrderNumber } from "@/lib/ids";
import { sha256 } from "@/lib/crypto";
import { formatMoney, dec } from "@/lib/money";
import { DomainError, forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, type AnyActor, SYSTEM, can } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { getConfig } from "@/server/admin/config";
import { notify } from "@/server/notifications/notify";
import { expireIfStale, isOrderable } from "@/server/quotes/service";
import { applyTransition } from "./engine";
import { pathForListing, STATE_LABEL } from "./state-machine";
import { buildSettlementPlan, createSettlementInstructions, MILESTONE_LABEL } from "@/server/settlement/settlement";
import { createPaymentIntent } from "@/server/payments/service";
import { env } from "@/config/env";
import { brand } from "@/config/brand";

export function paymentArrangementFromEnv(): string {
  const p = env().PAYMENT_PROVIDER;
  return p === "MANUAL_PILOT" ? "MANUAL_PILOT" : p === "LIVE_PARTNER" ? "PROVIDER_LIVE" : "SANDBOX_DEMO";
}

/** Record-level read access to an order. */
export async function canViewOrder(actor: Actor, order: Pick<Order, "id" | "buyerId" | "dealerOrgId">, db: Tx | typeof prisma = prisma): Promise<boolean> {
  if (order.buyerId === actor.userId) return true;
  if (can(actor, "order.view.all")) return true;
  if (order.dealerOrgId && actor.dealerOrgIds.includes(order.dealerOrgId)) return true;
  const assigned = await db.shipmentAssignment.count({ where: { userId: actor.userId, shipment: { orderId: order.id } } });
  return assigned > 0;
}

export async function getOrderForActor(actor: Actor, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !(await canViewOrder(actor, order))) throw notFound("Order");
  return order;
}

function buildContractText(args: {
  orderNumber: string; quoteNumber: string; quoteType: string; vehicle: string; total: string; payableNow: string; low: string; high: string;
  termsVersion: string; inspectionHours: number; schedule: { milestone: string; description: string; amount: string }[]; cancellation: string;
  arrangement: string; exclusions: string[]; assumptions: string[];
}) {
  return [
    `${brand.name} — Vehicle Purchase & Importation Agreement (terms version ${args.termsVersion})`,
    `Order ${args.orderNumber} · Quote ${args.quoteNumber} (${args.quoteType.replace(/_/g, " ").toLowerCase()})`,
    `Vehicle: ${args.vehicle}`,
    `Estimated total landed cost: ${args.total} (range ${args.low} – ${args.high}). Amount payable now: ${args.payableNow}.`,
    args.quoteType === "FIXED_PRICE" ? "This is a fixed-price quote for the included items." : "This is an ESTIMATE, not a guaranteed total. Variable government, shipping, currency and third-party charges may differ. Additional charges require buyer approval unless covered by a disclosed contractual exception.",
    `Payment arrangement: ${args.arrangement}.`,
    `Settlement schedule (funds are released only after verified milestones and dual approval, and are held while a dispute is open):`,
    ...args.schedule.map((s) => `  - ${s.milestone}: ${s.description} ${s.amount}`),
    `Inspection & acceptance period: ${args.inspectionHours} hours after recorded delivery. If no discrepancy is reported within this period the vehicle is deemed accepted.`,
    `Cancellation: ${args.cancellation}`,
    `Delivery timing is an estimate based on operational data; it is not guaranteed. Delays may arise from auctions, shipping schedules, port congestion, customs examination and document issues.`,
    `Assumptions: ${args.assumptions.join(" ")}`,
    `Exclusions: ${args.exclusions.join(" ")}`,
    `Costs already irreversibly incurred (e.g. released purchase funds, freight paid, duties paid) may not be refundable except where recovery is contractually available.`,
  ].join("\n");
}

/**
 * Buyer accepts a quote: creates the order, the immutable contract record, settlement instructions and
 * compliance checks, reserves the vehicle and moves to verification or payment.
 */
export async function acceptQuote(actor: Actor, quoteId: string, ctx: { acceptTerms: boolean; ip?: string; userAgent?: string; deliveryAddress?: string }) {
  if (!ctx.acceptTerms) throw invalid("You must accept the terms to place an order.");
  // Expire outside the order transaction so the status change persists even though acceptance fails.
  const pre = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (pre && (!pre.buyerId || pre.buyerId === actor.userId) && (await expireIfStale(pre))) {
    throw new DomainError("PRECONDITION_FAILED", "This quote has expired. Please request a new quote with current prices.");
  }
  return transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${quoteId} FOR UPDATE`;
    const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { lineItems: true, listing: { include: { dealerOrg: true } }, sourcingOffer: true, order: true } });
    if (!quote) throw notFound("Quote");
    if (quote.buyerId && quote.buyerId !== actor.userId) throw notFound("Quote");
    if (quote.order) throw precondition("An order already exists for this quote.");
    if (await expireIfStale(quote, tx)) throw new DomainError("PRECONDITION_FAILED", "This quote has expired. Please request a new quote with current prices.");
    if (quote.status !== "ISSUED") throw precondition("This quote is no longer available.");

    let listingPrevAvailability: string | null = null;
    let dealerOrgId: string | null = null;
    let vehicleLabel = "";
    let cancellation = "Before payment, either party may cancel without charge. After payment, cancellation is subject to costs irreversibly incurred.";
    if (quote.listing) {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "VehicleListing" WHERE id = ${quote.listing.id} FOR UPDATE`;
      void rows;
      const listing = await tx.vehicleListing.findUniqueOrThrow({ where: { id: quote.listing.id } });
      if (!isOrderable(listing)) throw precondition("This vehicle has just been reserved or is no longer available.");
      listingPrevAvailability = listing.availability;
      dealerOrgId = listing.dealerOrgId;
      vehicleLabel = `${listing.year} ${listing.make} ${listing.model}${listing.trim ? " " + listing.trim : ""} (${listing.publicRef})`;
      if (listing.cancellationTerms) cancellation = listing.cancellationTerms;
      await tx.vehicleListing.update({ where: { id: listing.id }, data: { availability: "RESERVED" } });
    } else if (quote.sourcingOffer) {
      dealerOrgId = quote.sourcingOffer.dealerOrgId;
      vehicleLabel = quote.sourcingOffer.vehicleDescription;
      await tx.sourcingOffer.update({ where: { id: quote.sourcingOffer.id }, data: { status: "ACCEPTED" } });
      await tx.sourcingRequest.update({ where: { id: quote.sourcingOffer.requestId }, data: { status: "OFFER_ACCEPTED" } });
    } else throw precondition("Quote is not linked to a vehicle.");

    const path = pathForListing(quote.listing?.listingType ?? "OVERSEAS_SUPPLIER_STOCK", quote.listing?.availability ?? "AVAILABLE_FOR_PURCHASE", !!quote.sourcingOffer);
    const inspectionHours = await getConfig("orders.inspectionPeriodHours", tx);
    const releasePct = await getConfig("settlement.vehicleReleaseOnPurchasePercent", tx);
    const agreement = dealerOrgId
      ? await tx.dealerCommercialAgreement.findFirst({ where: { orgId: dealerOrgId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, orderBy: { effectiveFrom: "desc" } })
      : null;
    const plan = buildSettlementPlan({
      path,
      lines: quote.lineItems.map((l) => ({ category: l.category, amount: l.amount, beneficiary: l.beneficiary, payableStage: l.payableStage })),
      dealerOrgId, vehicleReleaseOnPurchasePercent: releasePct,
      dealerCommission: agreement ? { percent: agreement.commissionPercent, fixed: agreement.fixedFeePerSale } : null,
    });
    const arrangement = paymentArrangementFromEnv();
    const orderNumber = newOrderNumber();
    const order = await tx.order.create({
      data: {
        orderNumber, buyerId: actor.userId, quoteId: quote.id, listingId: quote.listingId, dealerOrgId, path, currency: quote.currency,
        agreedTotal: quote.totalEstimate, payableNow: quote.payableNow, paymentArrangement: arrangement, inspectionPeriodHours: inspectionHours,
        isDemo: arrangement !== "PROVIDER_LIVE",
      },
    });
    await tx.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), buyerId: actor.userId } });
    await createSettlementInstructions(tx, order.id, order.currency, plan);

    const content = buildContractText({
      orderNumber, quoteNumber: quote.quoteNumber, quoteType: quote.type, vehicle: vehicleLabel,
      total: formatMoney(quote.totalEstimate), payableNow: formatMoney(quote.payableNow), low: formatMoney(quote.lowEstimate), high: formatMoney(quote.highEstimate),
      termsVersion: quote.termsVersion, inspectionHours,
      schedule: plan.map((p) => ({ milestone: MILESTONE_LABEL[p.milestone], description: `${p.description} → ${p.beneficiary.toLowerCase().replace(/_/g, " ")}`, amount: formatMoney(p.amount) })),
      cancellation,
      arrangement: arrangement === "SANDBOX_DEMO" ? "SANDBOX DEMONSTRATION — no real money is accepted" : arrangement === "MANUAL_PILOT" ? "Manual pilot: bank transfer verified by finance staff (not automated escrow)" : "Authorised protected-funds partner",
      exclusions: quote.exclusions, assumptions: quote.assumptions,
    });
    await tx.contract.create({
      data: {
        orderId: order.id, termsVersion: quote.termsVersion, content, contentSha256: sha256(content),
        settlementSchedule: plan.map((p) => ({ ...p, amount: p.amount.toFixed(2) })) as unknown as Prisma.InputJsonValue,
        inspectionPeriodHours: inspectionHours, acceptedById: actor.userId, acceptedAt: new Date(), acceptedIp: ctx.ip, acceptedUserAgent: ctx.userAgent?.slice(0, 300),
      },
    });
    if (ctx.deliveryAddress) {
      await tx.deliveryRecord.create({ data: { orderId: order.id, address: ctx.deliveryAddress } });
    }
    await tx.orderTransition.create({
      data: {
        orderId: order.id, sequence: 1, fromState: null, toState: "ORDER_CREATED", actorId: actor.userId, actorRole: "BUYER",
        description: `Order created from quote ${quote.quoteNumber}; contract terms ${quote.termsVersion} accepted`,
        evidenceDocumentIds: [], metadata: { listingPrevAvailability, contractSha256: sha256(content) },
      },
    });
    await audit(tx, { actor, action: "order.created", entityType: "Order", entityId: order.id, summary: `Order ${orderNumber} created (${path})`, ip: ctx.ip, userAgent: ctx.userAgent });

    const checks = await determineComplianceChecks(tx, actor.userId, dec(quote.totalEstimate));
    for (const c of checks) await tx.complianceCheck.create({ data: { orderId: order.id, type: c.type, status: c.status, reason: c.reason } });
    const outstanding = checks.filter((c) => c.status === "REQUIRED");
    await notify(tx, {
      userId: actor.userId, templateKey: "order.created", dedupeKey: `order:${order.id}:created`,
      vars: { orderNumber, nextStep: outstanding.length ? "complete identity verification" : "make payment using the instructions in your dashboard" },
      link: `/account/orders/${order.id}`,
    });
    if (outstanding.length) {
      await applyTransition(tx, SYSTEM("compliance"), order.id, { to: "COMPLIANCE_CHECK", description: `Required: ${outstanding.map((c) => c.type.toLowerCase().replace(/_/g, " ")).join(", ")}` });
    } else {
      await moveToAwaitingPayment(tx, order.id);
    }
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}

async function determineComplianceChecks(tx: Tx, buyerId: string, total: ReturnType<typeof dec>) {
  const idThreshold = await getConfig("kyc.identityRequiredAboveNGN", tx);
  const eddThreshold = await getConfig("kyc.eddRequiredAboveNGN", tx);
  const profile = await tx.buyerProfile.findUnique({ where: { userId: buyerId } });
  const out: { type: "IDENTITY" | "ENHANCED_DUE_DILIGENCE"; status: "REQUIRED" | "PASSED"; reason: string }[] = [];
  if (total.gt(idThreshold)) {
    out.push({ type: "IDENTITY", status: profile?.identityStatus === "VERIFIED" ? "PASSED" : "REQUIRED", reason: `Order value above ₦${Number(idThreshold).toLocaleString()} requires verified identity` });
  }
  if (total.gt(eddThreshold)) {
    out.push({ type: "ENHANCED_DUE_DILIGENCE", status: "REQUIRED", reason: `Order value above ₦${Number(eddThreshold).toLocaleString()} requires source-of-funds review` });
  }
  return out;
}

async function moveToAwaitingPayment(tx: Tx, orderId: string) {
  const order = await applyTransition(tx, SYSTEM("compliance-cleared"), orderId, { to: "AWAITING_PAYMENT" });
  await createPaymentIntent(tx, order, { amount: order.payableNow });
}

/** Re-evaluate orders waiting on compliance (called when a buyer's identity is verified or a check is passed). */
export async function reevaluateCompliance(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { complianceChecks: true } });
  if (order.state !== "COMPLIANCE_CHECK") return;
  const profile = await tx.buyerProfile.findUnique({ where: { userId: order.buyerId } });
  for (const c of order.complianceChecks) {
    if (c.type === "IDENTITY" && c.status === "REQUIRED" && profile?.identityStatus === "VERIFIED") {
      await tx.complianceCheck.update({ where: { id: c.id }, data: { status: "PASSED", reviewedAt: new Date(), notes: "Buyer identity verified" } });
    }
  }
  const remaining = await tx.complianceCheck.count({ where: { orderId, status: { in: ["REQUIRED", "FAILED"] } } });
  if (remaining === 0) await moveToAwaitingPayment(tx, orderId);
}

export async function reviewComplianceCheck(actor: Actor, checkId: string, decision: "PASSED" | "FAILED" | "WAIVED", notes: string) {
  if (!can(actor, "compliance.review")) throw forbidden();
  return transaction(async (tx) => {
    const c = await tx.complianceCheck.findUnique({ where: { id: checkId } });
    if (!c) throw notFound("Compliance check");
    await tx.complianceCheck.update({ where: { id: checkId }, data: { status: decision, reviewedById: actor.userId, reviewedAt: new Date(), notes } });
    await audit(tx, { actor, action: "compliance.reviewed", entityType: "ComplianceCheck", entityId: checkId, summary: `${c.type} → ${decision}: ${notes}` });
    if (decision === "FAILED") {
      await applyTransition(tx, SYSTEM("compliance-failed"), c.orderId, { to: "CANCELLED", description: `Compliance check failed: ${notes}` });
    } else await reevaluateCompliance(tx, c.orderId);
  });
}

export async function buyerCancel(actor: Actor, orderId: string, reason: string) {
  return transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.buyerId !== actor.userId) throw notFound("Order");
    return applyTransition(tx, actor, orderId, { to: "CANCELLED", description: reason?.trim() || "Cancelled by buyer before payment" });
  });
}

export async function buyerAcceptVehicle(actor: Actor, orderId: string) {
  return transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.buyerId !== actor.userId) throw notFound("Order");
    const d = await tx.deliveryRecord.findUnique({ where: { orderId } });
    if (d && !d.buyerAcknowledgedAt) await tx.deliveryRecord.update({ where: { orderId }, data: { buyerAcknowledgedAt: new Date() } });
    return applyTransition(tx, actor, orderId, { to: "ACCEPTED", description: "Buyer accepted the vehicle after inspection" });
  });
}

/** Scheduled job: auto-accept after the contractual inspection period if no dispute is open. */
export async function processAcceptanceExpiry(orderId: string) {
  return transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.state !== "ACCEPTANCE_PERIOD" || !order.acceptanceDeadline || order.acceptanceDeadline > new Date()) return false;
    const open = await tx.dispute.count({ where: { orderId, status: { in: ["OPEN", "AWAITING_RESPONSE", "UNDER_INVESTIGATION"] } } });
    if (open > 0) return false;
    await applyTransition(tx, SYSTEM("acceptance-period-expired"), orderId, { to: "ACCEPTED", description: "Inspection period ended without a reported discrepancy — deemed accepted under the contract" });
    return true;
  });
}

export async function orderTimeline(orderId: string) {
  const [transitions, shipment] = await Promise.all([
    prisma.orderTransition.findMany({ where: { orderId }, orderBy: { sequence: "asc" } }),
    prisma.shipment.findUnique({ where: { orderId }, include: { events: { where: { visibleToBuyer: true }, orderBy: { occurredAt: "asc" } }, etaRevisions: { orderBy: { createdAt: "asc" } } } }),
  ]);
  return { transitions, shipment };
}

export { STATE_LABEL };
export type { AnyActor };
