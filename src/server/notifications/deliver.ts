import { prisma } from "@/server/db";
import { adapterFor } from "./channels";

/** Deliver one queued notification. Throws on retryable failure so the job queue applies backoff. */
export async function deliverNotification(notificationId: string): Promise<void> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId }, include: { user: true } });
  if (!n || n.status === "SENT" || n.status === "SKIPPED") return; // idempotent
  const attempt = n.attempts + 1;
  let result;
  try {
    result = await adapterFor(n.channel).send(n, n.user);
  } catch (e) {
    result = { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  await prisma.notificationDelivery.create({
    data: { notificationId: n.id, attempt, success: result.success, providerMessageId: result.providerMessageId, error: result.error },
  });
  if (result.success) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", attempts: attempt, sentAt: new Date(), lastError: null } });
    return;
  }
  if (result.skipped) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "SKIPPED", attempts: attempt, lastError: result.error } });
    return;
  }
  await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED", attempts: attempt, lastError: result.error } });
  throw new Error(result.error ?? "delivery failed");
}
