import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedPricing, makeUser, prisma } from "./helpers";
import { createOrder, createPaidOrder } from "./flow";
import { handlePaymentWebhook, recordManualCredit, approveManualCredit } from "@/server/payments/service";
import { simulateIncomingTransfer, signSandboxPayload } from "@/server/payments/sandbox";
import { trialBalance, unbalancedTransactions, orderHeldBalance, post, ACCOUNTS } from "@/server/ledger/ledger";
import { runReconciliation } from "@/server/payments/reconciliation";
import { D } from "@/lib/money";
import { SYSTEM } from "@/server/auth/actor";
import { transaction } from "@/server/db";

describe("payments, webhooks and ledger", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricing();
  });

  it("confirms payment from a signed provider webhook and balances the ledger", async () => {
    const { order, res, intent } = await createPaidOrder();
    expect(res.status).toBe(200);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { escrow: true } });
    expect(o.state).toBe("FUNDS_PROTECTED");
    expect(o.escrow?.status).toBe("SANDBOX_SIMULATED");
    expect((await orderHeldBalance(prisma, order.id, "NGN")).equals(intent.amount)).toBe(true);
    for (const row of await trialBalance()) expect(row.balanced).toBe(true);
    expect(await unbalancedTransactions()).toEqual([]);
  });

  it("processes duplicate webhooks exactly once (no double ledger entries or notifications)", async () => {
    const { order } = await createOrder();
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    const sim = await simulateIncomingTransfer(intent.reference, intent.amount);
    const first = await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
    const second = await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
    const [a, b] = await Promise.all([handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers), handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers)]);
    expect(first.body.duplicate).toBeUndefined();
    expect(second.body.duplicate).toBe(true);
    expect(a.body.duplicate && b.body.duplicate).toBe(true);
    expect(await prisma.ledgerTransaction.count({ where: { kind: "COLLECTION" } })).toBe(1);
    expect(await prisma.providerTransaction.count()).toBe(1);
    expect(await prisma.notification.count({ where: { templateKey: "payment.confirmed", channel: "IN_APP" } })).toBe(1);
    expect((await prisma.webhookEvent.findFirstOrThrow({ where: { eventId: sim.event.eventId } })).attempts).toBe(4);
  });

  it("is idempotent even if the provider re-sends the same transaction under a new event id", async () => {
    const { order } = await createOrder();
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    const sim = await simulateIncomingTransfer(intent.reference, intent.amount);
    await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
    const body = JSON.stringify({ ...sim.event, eventId: "evt_different" });
    const ts = String(Date.now());
    const r = await handlePaymentWebhook("SANDBOX", body, { "x-sandbox-signature": signSandboxPayload(body, ts), "x-sandbox-timestamp": ts });
    expect(r.status).toBe(200);
    expect(await prisma.ledgerTransaction.count({ where: { kind: "COLLECTION" } })).toBe(1);
  });

  it("rejects webhooks with invalid or stale signatures", async () => {
    const { order } = await createOrder();
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    const sim = await simulateIncomingTransfer(intent.reference, intent.amount);
    const tampered = sim.rawBody.replace(intent.amount.toFixed(2), "1.00");
    expect((await handlePaymentWebhook("SANDBOX", tampered, sim.headers)).status).toBe(401);
    const old = String(Date.now() - 10 * 60 * 1000);
    expect((await handlePaymentWebhook("SANDBOX", sim.rawBody, { "x-sandbox-signature": signSandboxPayload(sim.rawBody, old), "x-sandbox-timestamp": old })).status).toBe(401);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).state).toBe("AWAITING_PAYMENT");
  });

  it("keeps partially paid orders awaiting payment", async () => {
    const { order } = await createOrder();
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    const sim = await simulateIncomingTransfer(intent.reference, intent.amount.dividedBy(2).toDecimalPlaces(2));
    await handlePaymentWebhook("SANDBOX", sim.rawBody, sim.headers);
    expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })).status).toBe("PARTIALLY_PAID");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).state).toBe("AWAITING_PAYMENT");
  });

  it("enforces ledger balance and immutability in the database", async () => {
    await expect(
      transaction((tx) => post(tx, { reference: "bad", kind: "TEST", description: "unbalanced", entries: [
        { account: ACCOUNTS.platformRevenue("NGN"), direction: "CREDIT", amount: new D(10) },
        { account: ACCOUNTS.processingFees("NGN"), direction: "DEBIT", amount: new D(9) },
      ] })),
    ).rejects.toThrow(/unbalanced/);
    // Bypass application checks entirely: the deferred DB trigger must still reject it.
    const acct = await prisma.ledgerAccount.create({ data: { code: "TEST:X", name: "x", type: "ASSET", currency: "NGN" } });
    await expect(prisma.$transaction(async (tx) => {
      const t = await tx.ledgerTransaction.create({ data: { reference: "raw", kind: "TEST", description: "raw" } });
      await tx.ledgerEntry.create({ data: { transactionId: t.id, accountId: acct.id, direction: "DEBIT", amount: new D(5), currency: "NGN" } });
    })).rejects.toThrow(/unbalanced/);
    const { order } = await createPaidOrder();
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { transaction: { orderId: order.id } } });
    await expect(prisma.ledgerEntry.update({ where: { id: entry.id }, data: { amount: new D(1) } })).rejects.toThrow(/append-only/);
  });

  it("requires two different finance users for manual pilot confirmations", async () => {
    const { order } = await createOrder();
    await prisma.order.update({ where: { id: order.id }, data: { paymentArrangement: "MANUAL_PILOT" } });
    const intent = await prisma.paymentIntent.update({ where: { id: (await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } })).id }, data: { provider: "MANUAL_PILOT" } });
    const maker = await makeUser(["FINANCE"]);
    const checker = await makeUser(["FINANCE"]);
    const buyerish = await makeUser(["BUYER"]);
    await expect(recordManualCredit(buyerish, { paymentIntentId: intent.id, amount: intent.amount.toFixed(2), bankStatementRef: "STMT-1", occurredAt: new Date() })).rejects.toThrow(/permission/);
    const ptx = await recordManualCredit(maker, { paymentIntentId: intent.id, amount: intent.amount.toFixed(2), bankStatementRef: "STMT-1", occurredAt: new Date() });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).state).toBe("AWAITING_PAYMENT");
    await expect(approveManualCredit(maker, ptx.id)).rejects.toThrow(/Dual control/);
    await expect(recordManualCredit(maker, { paymentIntentId: intent.id, amount: "1", bankStatementRef: "STMT-1", occurredAt: new Date() })).rejects.toThrow(/already been recorded/);
    await approveManualCredit(checker, ptx.id);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { escrow: true } });
    expect(o.state).toBe("FUNDS_PROTECTED");
    expect(o.escrow?.status).toBe("MANUAL_PILOT_ACCOUNT");
  });

  it("reconciles provider statements against internal records and detects discrepancies", async () => {
    await createPaidOrder();
    const start = new Date(Date.now() - 3600_000);
    const end = new Date(Date.now() + 60_000);
    const { report } = await runReconciliation(SYSTEM("test"), "SANDBOX", start, end);
    expect(report.matched).toHaveLength(1);
    expect(report.mismatched).toHaveLength(0);
    expect(report.ledgerBalanced).toBe(true);
    expect(report.positionDifference).toBe("0.00");
    // Provider receives money we never recorded (e.g. webhook lost) → reported as missing internally.
    await simulateIncomingTransfer("PAY-UNKNOWN", "5000.00");
    const r2 = await runReconciliation(SYSTEM("test"), "SANDBOX", start, new Date(Date.now() + 60_000));
    expect(r2.report.missingInternal).toHaveLength(1);
    expect(r2.report.positionDifference).not.toBe("0.00");
    expect(r2.run.ledgerBalanced).toBe(false);
  });
});
