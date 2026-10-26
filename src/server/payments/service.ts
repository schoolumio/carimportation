import { Prisma, type Order, type PaymentIntent, type PaymentProviderKey, type ProviderTransaction } from "@prisma/client";
import type { Tx } from "@/server/db";
import { prisma, transaction } from "@/server/db";
import { D, type Dec, dec } from "@/lib/money";
import { newPaymentReference } from "@/lib/ids";
import { forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, requirePermission, SYSTEM } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { ACCOUNTS, post, type EntrySpec } from "@/server/ledger/ledger";
import { notify, notifyRole } from "@/server/notifications/notify";
import { applyTransition } from "@/server/orders/engine";
import { getConfig } from "@/server/admin/config";
import { providerFor } from "./registry";
import type { NormalizedPaymentEvent } from "./provider";
import { formatMoney } from "@/lib/money";

export function providerKeyForArrangement(arrangement: string): PaymentProviderKey {
  if (arrangement === "MANUAL_PILOT") return "MANUAL_PILOT";
  if (arrangement === "PROVIDER_LIVE") return "LIVE_PARTNER";
  return "SANDBOX";
}

export async function createPaymentIntent(
  tx: Tx,
  order: Order,
  opts: { amount: Dec; purpose?: "ORDER_PAYMENT" | "ADDITIONAL_COST"; costAdjustmentId?: string },
): Promise<PaymentIntent> {
  const providerKey = providerKeyForArrangement(order.paymentArrangement);
  const provider = providerFor(providerKey);
  const hours = await getConfig("orders.paymentWindowHours", tx);
  const intent = await tx.paymentIntent.create({
    data: {
      orderId: order.id, reference: newPaymentReference(), provider: providerKey, method: "BANK_TRANSFER",
      purpose: opts.purpose ?? "ORDER_PAYMENT", costAdjustmentId: opts.costAdjustmentId,
      amount: opts.amount, currency: order.currency, status: "PENDING", expiresAt: new Date(Date.now() + hours * 3600_000),
    },
  });
  const { providerRef, instructions } = await provider.createCollection(intent);
  const updated = await tx.paymentIntent.update({ where: { id: intent.id }, data: { providerRef, instructions: instructions as unknown as Prisma.InputJsonValue } });
  await notify(tx, {
    userId: order.buyerId, templateKey: "order.payment_instructions", dedupeKey: `intent:${intent.id}:instructions`,
    vars: { orderNumber: order.orderNumber, amount: formatMoney(opts.amount, order.currency), reference: intent.reference },
    link: `/account/orders/${order.id}`,
  });
  return updated;
}

export interface CollectionRecord {
  provider: PaymentProviderKey;
  providerTxnId: string;
  reference: string;
  amount: Dec;
  fee: Dec;
  currency: string;
  occurredAt: Date;
  webhookEventId?: string;
  isDemo: boolean;
}

/** Idempotently record a provider-side collection. Returns the existing record if already known. */
export async function recordCollection(tx: Tx, c: CollectionRecord): Promise<ProviderTransaction> {
  const existing = await tx.providerTransaction.findUnique({ where: { provider_providerTxnId: { provider: c.provider, providerTxnId: c.providerTxnId } } });
  if (existing) return existing;
  const intent = await tx.paymentIntent.findUnique({ where: { reference: c.reference } });
  return tx.providerTransaction.create({
    data: {
      provider: c.provider, providerTxnId: c.providerTxnId, type: "COLLECTION", status: "SUCCEEDED", amount: c.amount, fee: c.fee,
      currency: c.currency, reference: c.reference, paymentIntentId: intent?.id ?? null, webhookEventId: c.webhookEventId,
      occurredAt: c.occurredAt, isDemo: c.isDemo,
    },
  });
}

/**
 * Apply a SUCCEEDED provider collection to the ledger, payment intent and order.
 * Idempotent: anchored on the unique ledger reference `collection:<provider>:<providerTxnId>`.
 */
export async function applyCollection(tx: Tx, ptx: ProviderTransaction): Promise<{ applied: boolean; reason?: string }> {
  if (ptx.status !== "SUCCEEDED") return { applied: false, reason: "not-succeeded" };
  const ledgerRef = `collection:${ptx.provider}:${ptx.providerTxnId}`;
  if (await tx.ledgerTransaction.findUnique({ where: { reference: ledgerRef } })) return { applied: false, reason: "duplicate" };

  const intent = ptx.paymentIntentId ? await tx.paymentIntent.findUnique({ where: { id: ptx.paymentIntentId }, include: { order: true } }) : null;
  if (!intent) {
    await notifyRole(tx, "FINANCE", { templateKey: "order.milestone", dedupeKey: `unmatched:${ptx.id}`, vars: { orderNumber: "UNMATCHED", milestone: "Unmatched payment", description: `Provider transaction ${ptx.providerTxnId} with reference ${ptx.reference} did not match any payment intent.` } });
    await audit(tx, { actor: SYSTEM("payments"), action: "payment.unmatched", entityType: "ProviderTransaction", entityId: ptx.id, summary: `Unmatched collection ${ptx.reference}` });
    return { applied: false, reason: "unmatched" };
  }
  if (intent.currency !== ptx.currency) {
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "DISPUTED" } });
    await audit(tx, { actor: SYSTEM("payments"), action: "payment.currency_mismatch", entityType: "PaymentIntent", entityId: intent.id, summary: `Currency mismatch: expected ${intent.currency}, got ${ptx.currency}` });
    return { applied: false, reason: "currency-mismatch" };
  }
  const order = intent.order;
  const net = ptx.amount.minus(ptx.fee);
  const entries: EntrySpec[] = [
    { account: ACCOUNTS.safeguarded(ptx.provider, ptx.currency), direction: "DEBIT" as const, amount: net },
    { account: ACCOUNTS.buyerFundsHeld(order.id, ptx.currency), direction: "CREDIT" as const, amount: ptx.amount },
  ];
  if (ptx.fee.gt(0)) entries.push({ account: ACCOUNTS.processingFees(ptx.currency), direction: "DEBIT" as const, amount: ptx.fee });
  await post(tx, {
    reference: ledgerRef, kind: "COLLECTION", description: `Payment ${ptx.reference} received via ${ptx.provider}`,
    orderId: order.id, isDemo: ptx.isDemo, entries,
  });

  const received = dec(intent.amountReceived).plus(ptx.amount);
  const status = received.gte(intent.amount) ? "SUCCEEDED" : "PARTIALLY_PAID";
  await tx.paymentIntent.update({ where: { id: intent.id }, data: { amountReceived: received, status } });
  await tx.providerTransaction.update({ where: { id: ptx.id }, data: { paymentIntentId: intent.id } });
  await audit(tx, { actor: SYSTEM("payments"), action: "payment.applied", entityType: "PaymentIntent", entityId: intent.id, summary: `Applied ${ptx.amount.toFixed(2)} ${ptx.currency} (${status})`, after: { providerTxnId: ptx.providerTxnId } });

  if (status === "PARTIALLY_PAID") {
    await notify(tx, { userId: order.buyerId, templateKey: "payment.partial", dedupeKey: `intent:${intent.id}:partial:${ptx.providerTxnId}`, vars: { orderNumber: order.orderNumber, received: formatMoney(received, intent.currency), expected: formatMoney(intent.amount, intent.currency) }, link: `/account/orders/${order.id}` });
    return { applied: true };
  }
  if (received.gt(intent.amount)) {
    await notifyRole(tx, "FINANCE", { templateKey: "order.milestone", dedupeKey: `overpaid:${intent.id}`, vars: { orderNumber: order.orderNumber, milestone: "Overpayment received", description: `Received ${received.toFixed(2)} against ${intent.amount.toFixed(2)}. Refund the excess.` } });
  }
  await notify(tx, { userId: order.buyerId, templateKey: "payment.confirmed", dedupeKey: `intent:${intent.id}:confirmed`, vars: { orderNumber: order.orderNumber, amount: formatMoney(intent.amount, intent.currency) }, link: `/account/orders/${order.id}` });

  if (intent.purpose === "ORDER_PAYMENT") {
    if (order.state === "AWAITING_PAYMENT") {
      await applyTransition(tx, SYSTEM("payment-confirmed"), order.id, { to: "FUNDS_CONFIRMED", description: `Verified ${ptx.provider} transaction ${ptx.providerTxnId}`, metadata: { providerTxnId: ptx.providerTxnId } });
      const escrowStatus = ptx.provider === "SANDBOX" ? "SANDBOX_SIMULATED" : ptx.provider === "MANUAL_PILOT" ? "MANUAL_PILOT_ACCOUNT" : "ACTIVE";
      await tx.escrowReference.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, provider: ptx.provider, externalReference: intent.providerRef, status: escrowStatus },
        update: { status: escrowStatus, externalReference: intent.providerRef },
      });
      await applyTransition(tx, SYSTEM("funds-protected"), order.id, {
        to: "FUNDS_PROTECTED",
        description: ptx.provider === "SANDBOX" ? "Funds recorded in the SANDBOX protected-funds simulation (no real money)" : ptx.provider === "MANUAL_PILOT" ? "Funds recorded against the pilot designated account (manual verification)" : "Funds held with authorised partner",
      });
    } else {
      await notifyRole(tx, "FINANCE", { templateKey: "order.milestone", dedupeKey: `late-payment:${intent.id}`, vars: { orderNumber: order.orderNumber, milestone: "Payment received on non-payable order", description: `Order is ${order.state}; review and refund if required.` } });
    }
  } else if (intent.purpose === "ADDITIONAL_COST" && intent.costAdjustmentId) {
    const { onAdditionalCostPaid } = await import("@/server/logistics/costs");
    await onAdditionalCostPaid(tx, intent.costAdjustmentId);
  }
  return { applied: true };
}

async function applyReversal(tx: Tx, provider: PaymentProviderKey, ev: NormalizedPaymentEvent) {
  const original = await tx.providerTransaction.findUnique({ where: { provider_providerTxnId: { provider, providerTxnId: ev.providerTxnId } }, include: { paymentIntent: { include: { order: true } } } });
  if (!original?.paymentIntent) return;
  const ref = `reversal:collection:${provider}:${ev.providerTxnId}`;
  if (await tx.ledgerTransaction.findUnique({ where: { reference: ref } })) return;
  const order = original.paymentIntent.order;
  await tx.providerTransaction.update({ where: { id: original.id }, data: { status: "REVERSED" } });
  await post(tx, {
    reference: ref, kind: "REVERSAL", description: `Provider reversed collection ${ev.providerTxnId}`, orderId: order.id, isDemo: original.isDemo,
    entries: [
      { account: ACCOUNTS.buyerFundsHeld(order.id, original.currency), direction: "DEBIT", amount: original.amount },
      { account: ACCOUNTS.safeguarded(provider, original.currency), direction: "CREDIT", amount: original.amount },
    ],
  });
  await tx.paymentIntent.update({ where: { id: original.paymentIntentId! }, data: { status: "REVERSED", amountReceived: dec(original.paymentIntent.amountReceived).minus(original.amount) } });
  const { freezeOrderFunds } = await import("@/server/settlement/settlement");
  await freezeOrderFunds(tx, order.id, "Payment reversed by provider");
  await notifyRole(tx, "FINANCE", { templateKey: "order.milestone", dedupeKey: `reversed:${original.id}`, vars: { orderNumber: order.orderNumber, milestone: "Payment reversed", description: `Collection ${ev.providerTxnId} was reversed. Funds frozen pending review.` } });
  await audit(tx, { actor: SYSTEM("payments"), action: "payment.reversed", entityType: "ProviderTransaction", entityId: original.id, summary: `Collection reversed by provider` });
}

export type WebhookOutcome = { status: number; body: { ok: boolean; duplicate?: boolean; error?: string } };

/**
 * Verified, idempotent webhook processing. Retries of the same event are acknowledged without reprocessing,
 * so ledger entries, state transitions and notifications are never duplicated.
 */
export async function handlePaymentWebhook(providerKey: PaymentProviderKey, rawBody: string, headers: Record<string, string | null>): Promise<WebhookOutcome> {
  const provider = providerFor(providerKey);
  let parsed: NormalizedPaymentEvent | null = null;
  try {
    parsed = provider.parseWebhook(rawBody);
  } catch {
    parsed = null;
  }
  const signatureValid = provider.verifyWebhook(rawBody, headers);
  if (!signatureValid || !parsed) {
    // Record rejected attempts for security review, keyed so that they cannot collide with real events.
    await prisma.webhookEvent.create({
      data: { provider: providerKey, eventId: `rejected:${Date.now()}:${Math.random().toString(36).slice(2)}`, eventType: parsed?.type ?? "unknown", payload: { rawLength: rawBody.length }, signatureValid, status: "REJECTED", error: !signatureValid ? "invalid signature" : "malformed payload" },
    });
    return { status: 401, body: { ok: false, error: "invalid signature or payload" } };
  }

  let eventRow;
  try {
    eventRow = await prisma.webhookEvent.create({
      data: { provider: providerKey, eventId: parsed.eventId, eventType: parsed.type, payload: JSON.parse(rawBody), signatureValid: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const prev = await prisma.webhookEvent.update({ where: { provider_eventId: { provider: providerKey, eventId: parsed.eventId } }, data: { attempts: { increment: 1 } } });
      if (prev.status !== "FAILED") return { status: 200, body: { ok: true, duplicate: true } };
      eventRow = prev; // retry a previously failed processing attempt
    } else throw e;
  }

  try {
    await transaction(async (tx) => {
      const ev = parsed!;
      if (ev.type === "collection.succeeded") {
        const ptx = await recordCollection(tx, {
          provider: providerKey, providerTxnId: ev.providerTxnId, reference: ev.reference, amount: new D(ev.amount), fee: new D(ev.fee || 0),
          currency: ev.currency, occurredAt: new Date(ev.occurredAt), webhookEventId: eventRow!.id, isDemo: !provider.isLive,
        });
        await applyCollection(tx, ptx);
      } else if (ev.type === "collection.reversed") {
        await applyReversal(tx, providerKey, ev);
      } else if (ev.type === "collection.failed") {
        const intent = await tx.paymentIntent.findUnique({ where: { reference: ev.reference } });
        if (intent && intent.status === "PENDING") await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED" } });
      }
      await tx.webhookEvent.update({ where: { id: eventRow!.id }, data: { status: "PROCESSED", processedAt: new Date(), error: null } });
    });
    return { status: 200, body: { ok: true } };
  } catch (e) {
    await prisma.webhookEvent.update({ where: { id: eventRow.id }, data: { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 1000) : String(e) } });
    return { status: 500, body: { ok: false, error: "processing failed; provider should retry" } };
  }
}

// ─── Manual pilot (maker-checker) ────────────────────────────────────────────

export async function recordManualCredit(actor: Actor, input: { paymentIntentId: string; amount: string; bankStatementRef: string; occurredAt: Date }) {
  requirePermission(actor, "payment.manual.record");
  if (!(await getConfig("payments.manualPilotEnabled"))) throw precondition("Manual pilot payments are disabled.");
  const amount = new D(input.amount);
  if (!amount.gt(0)) throw invalid("Amount must be positive.");
  if (!input.bankStatementRef.trim()) throw invalid("Bank statement reference is required.");
  return transaction(async (tx) => {
    const intent = await tx.paymentIntent.findUnique({ where: { id: input.paymentIntentId } });
    if (!intent) throw notFound("Payment intent");
    if (intent.provider !== "MANUAL_PILOT") throw precondition("This payment is not on the manual pilot arrangement.");
    const providerTxnId = `bank:${input.bankStatementRef.trim()}`;
    const dup = await tx.providerTransaction.findUnique({ where: { provider_providerTxnId: { provider: "MANUAL_PILOT", providerTxnId } } });
    if (dup) throw precondition("This bank statement reference has already been recorded.");
    const ptx = await tx.providerTransaction.create({
      data: { provider: "MANUAL_PILOT", providerTxnId, type: "COLLECTION", status: "PENDING", amount, currency: intent.currency, reference: intent.reference, paymentIntentId: intent.id, occurredAt: input.occurredAt, recordedById: actor.userId, bankStatementRef: input.bankStatementRef.trim() },
    });
    await audit(tx, { actor, action: "payment.manual_recorded", entityType: "ProviderTransaction", entityId: ptx.id, summary: `Recorded bank credit ${amount.toFixed(2)} ref ${input.bankStatementRef} (awaiting second approval)` });
    return ptx;
  });
}

export async function approveManualCredit(actor: Actor, providerTransactionId: string) {
  requirePermission(actor, "payment.manual.approve");
  return transaction(async (tx) => {
    const ptx = await tx.providerTransaction.findUnique({ where: { id: providerTransactionId } });
    if (!ptx || ptx.provider !== "MANUAL_PILOT") throw notFound("Manual payment record");
    if (ptx.status !== "PENDING") throw precondition("This record is not awaiting approval.");
    if (ptx.recordedById === actor.userId) throw forbidden("Dual control: a different finance user must approve this record.");
    const approved = await tx.providerTransaction.update({ where: { id: ptx.id }, data: { status: "SUCCEEDED", approvedById: actor.userId, reconciliation: "MATCHED", reconciledAt: new Date() } });
    await audit(tx, { actor, action: "payment.manual_approved", entityType: "ProviderTransaction", entityId: ptx.id, summary: `Approved bank credit ${ptx.amount.toFixed(2)}` });
    await applyCollection(tx, approved);
    return approved;
  });
}

export async function rejectManualCredit(actor: Actor, providerTransactionId: string, reason: string) {
  requirePermission(actor, "payment.manual.approve");
  return transaction(async (tx) => {
    const ptx = await tx.providerTransaction.findUnique({ where: { id: providerTransactionId } });
    if (!ptx || ptx.status !== "PENDING") throw precondition("Not awaiting approval.");
    await tx.providerTransaction.update({ where: { id: ptx.id }, data: { status: "FAILED", approvedById: actor.userId } });
    await audit(tx, { actor, action: "payment.manual_rejected", entityType: "ProviderTransaction", entityId: ptx.id, summary: `Rejected: ${reason}` });
  });
}

/** Buyers may upload a transfer receipt. It NEVER confirms payment; it only alerts finance to check the statement. */
export async function attachBuyerProof(actor: Actor, paymentIntentId: string, documentId: string, note?: string) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: paymentIntentId }, include: { order: true } });
  if (!intent || intent.order.buyerId !== actor.userId) throw notFound("Payment");
  await prisma.buyerPaymentProof.create({ data: { paymentIntentId, documentId, note } });
  await notifyRole(prisma, "FINANCE", { templateKey: "order.milestone", dedupeKey: `proof:${documentId}`, vars: { orderNumber: intent.order.orderNumber, milestone: "Buyer uploaded transfer receipt", description: "Verify against the bank statement. A receipt is not proof of payment." } });
  await audit(prisma, { actor, action: "payment.buyer_proof_uploaded", entityType: "PaymentIntent", entityId: intent.id, summary: "Buyer uploaded a transfer receipt (not conclusive)" });
}
