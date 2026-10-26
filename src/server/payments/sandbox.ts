// SANDBOX payment provider — simulated only. No real money moves. Every record is flagged as demo data.
import type { PaymentIntent } from "@prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/config/env";
import { hmac, safeEqual, randomToken } from "@/lib/crypto";
import { D, type Dec } from "@/lib/money";
import type { NormalizedPaymentEvent, PaymentProvider } from "./provider";

export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";
export const SANDBOX_TIMESTAMP_HEADER = "x-sandbox-timestamp";
const TOLERANCE_MS = 5 * 60 * 1000;

export function signSandboxPayload(rawBody: string, timestamp: string, secret = env().SANDBOX_WEBHOOK_SECRET) {
  return hmac(secret, `${timestamp}.${rawBody}`);
}

export const sandboxProvider: PaymentProvider = {
  key: "SANDBOX",
  displayName: "Sandbox payment simulator (no real money)",
  isLive: false,
  capabilities: { bankTransfer: true, cards: true, partialRefunds: true, milestoneRelease: true, webhooks: true, automatedReconciliation: true },

  async createCollection(intent: PaymentIntent) {
    const providerRef = `sbx_col_${randomToken(9)}`;
    return {
      providerRef,
      instructions: {
        method: "BANK_TRANSFER",
        bankName: "SANDBOX BANK (simulation)",
        accountName: "SANDBOX — DO NOT PAY",
        accountNumber: "99" + intent.reference.replace(/\D/g, "").padEnd(8, "0").slice(0, 8),
        reference: intent.reference,
        amount: intent.amount.toFixed(2),
        currency: intent.currency,
        expiresAt: intent.expiresAt.toISOString(),
        notes: [
          "This is a SANDBOX demonstration. Do not send real money.",
          "Use the simulator button to generate a signed provider webhook.",
        ],
      },
    };
  },

  async refund(p) {
    const providerTxnId = `sbx_ref_${randomToken(9)}`;
    await prisma.sandboxProviderRecord.create({
      data: { providerTxnId, type: "REFUND", status: "SUCCEEDED", amount: p.amount, currency: p.currency, reference: p.reference, occurredAt: new Date() },
    });
    return { providerTxnId, status: "SUCCEEDED" };
  },

  async payout(p) {
    const providerTxnId = `sbx_pay_${randomToken(9)}`;
    await prisma.sandboxProviderRecord.create({
      data: { providerTxnId, type: "PAYOUT", status: "SUCCEEDED", amount: p.amount, currency: p.currency, reference: p.reference, occurredAt: new Date() },
    });
    return { providerTxnId, status: "SUCCEEDED" };
  },

  async statement(from, to) {
    const rows = await prisma.sandboxProviderRecord.findMany({ where: { occurredAt: { gte: from, lte: to } }, orderBy: { occurredAt: "asc" } });
    return rows.map((r) => ({ providerTxnId: r.providerTxnId, type: r.type, status: r.status, amount: r.amount, fee: r.fee, currency: r.currency, reference: r.reference, occurredAt: r.occurredAt }));
  },

  verifyWebhook(rawBody, headers) {
    const sig = headers[SANDBOX_SIGNATURE_HEADER];
    const ts = headers[SANDBOX_TIMESTAMP_HEADER];
    if (!sig || !ts) return false;
    const t = Number(ts);
    if (!Number.isFinite(t) || Math.abs(Date.now() - t) > TOLERANCE_MS) return false;
    return safeEqual(sig, signSandboxPayload(rawBody, ts));
  },

  parseWebhook(rawBody) {
    const p = JSON.parse(rawBody) as NormalizedPaymentEvent;
    if (!p.eventId || !p.type || !p.providerTxnId || !p.reference) throw new Error("Malformed sandbox event");
    return p;
  },
};

/**
 * Simulate the provider receiving a bank transfer: records the provider-side transaction and
 * returns a signed webhook (raw body + headers) exactly as the provider would send it.
 */
export async function simulateIncomingTransfer(reference: string, amount: Dec | string, currency = "NGN", opts: { fee?: string } = {}) {
  const providerTxnId = `sbx_txn_${randomToken(9)}`;
  const occurredAt = new Date();
  await prisma.sandboxProviderRecord.create({
    data: { providerTxnId, type: "COLLECTION", status: "SUCCEEDED", amount: new D(amount), fee: new D(opts.fee ?? 0), currency, reference, occurredAt },
  });
  const event: NormalizedPaymentEvent = {
    eventId: `evt_${randomToken(12)}`, type: "collection.succeeded", providerTxnId, reference,
    amount: new D(amount).toFixed(2), fee: new D(opts.fee ?? 0).toFixed(2), currency, occurredAt: occurredAt.toISOString(),
  };
  const rawBody = JSON.stringify(event);
  const timestamp = String(Date.now());
  return {
    event, rawBody,
    headers: { [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(rawBody, timestamp), [SANDBOX_TIMESTAMP_HEADER]: timestamp } as Record<string, string>,
  };
}
