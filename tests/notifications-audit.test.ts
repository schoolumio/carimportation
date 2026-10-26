import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedPricing, makeUser, runJobs, prisma } from "./helpers";
import { createPaidOrder } from "./flow";
import { notify } from "@/server/notifications/notify";
import { setChannelAdapter } from "@/server/notifications/channels";
import { audit, verifyAuditChain } from "@/server/audit/audit";

describe("notifications", () => {
  beforeEach(resetDb);
  afterEach(() => setChannelAdapter("EMAIL", undefined));

  it("deduplicates notifications by business event key", async () => {
    const u = await makeUser(["BUYER"]);
    await notify(prisma, { userId: u.userId, templateKey: "order.milestone", dedupeKey: "evt-1", vars: { orderNumber: "X" } });
    await notify(prisma, { userId: u.userId, templateKey: "order.milestone", dedupeKey: "evt-1", vars: { orderNumber: "X" } });
    expect(await prisma.notification.count({ where: { userId: u.userId } })).toBe(2); // IN_APP + EMAIL, once each
    expect(await prisma.job.count({ where: { type: "notification.deliver" } })).toBe(1);
  });

  it("retries failed deliveries with backoff, logs each attempt, and stops after max attempts", async () => {
    const u = await makeUser(["BUYER"]);
    let calls = 0;
    setChannelAdapter("EMAIL", { send: async () => { calls++; return calls < 2 ? { success: false, error: "SMTP timeout" } : { success: true, providerMessageId: "m1" }; } });
    await notify(prisma, { userId: u.userId, templateKey: "order.milestone", dedupeKey: "evt-2", vars: {}, channels: ["EMAIL"] });
    await runJobs();
    let n = await prisma.notification.findFirstOrThrow({ where: { userId: u.userId } });
    expect(n.status).toBe("FAILED");
    const job = await prisma.job.findFirstOrThrow({ where: { type: "notification.deliver" } });
    expect(job.status).toBe("FAILED");
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    await runJobs();
    n = await prisma.notification.findFirstOrThrow({ where: { userId: u.userId } });
    expect(n.status).toBe("SENT");
    expect(await prisma.notificationDelivery.count({ where: { notificationId: n.id } })).toBe(2);

    setChannelAdapter("EMAIL", { send: async () => ({ success: false, error: "down" }) });
    await notify(prisma, { userId: u.userId, templateKey: "order.milestone", dedupeKey: "evt-3", vars: {}, channels: ["EMAIL"] });
    for (let i = 0; i < 6; i++) {
      await prisma.job.updateMany({ where: { status: "FAILED" }, data: { runAt: new Date() } });
      await runJobs();
    }
    expect((await prisma.job.findFirstOrThrow({ where: { dedupeKey: { contains: (await prisma.notification.findFirstOrThrow({ where: { dedupeKey: "evt-3:EMAIL" } })).id } } })).status).toBe("DEAD");
  });

  it("skips channels that are not configured instead of retrying forever", async () => {
    const u = await makeUser(["BUYER"]);
    await notify(prisma, { userId: u.userId, templateKey: "order.milestone", dedupeKey: "evt-4", vars: {}, channels: ["WHATSAPP"] });
    await runJobs();
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: u.userId } })).status).toBe("SKIPPED");
  });
});

describe("audit log", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPricing();
  });

  it("records sensitive operations in a tamper-evident, append-only chain", async () => {
    const { order } = await createPaidOrder();
    const events = await prisma.auditLog.findMany({ where: { entityId: order.id }, orderBy: { seq: "asc" } });
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["order.created", "order.transition"]));
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
    await expect(prisma.auditLog.update({ where: { id: events[0].id }, data: { summary: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await audit(prisma, { actor: null, action: "test", entityType: "X", entityId: "1", summary: "after" });
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });
});
