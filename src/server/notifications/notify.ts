import type { NotificationChannel } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { DEFAULT_TEMPLATES, render } from "./templates";
import { enqueueJob } from "@/server/jobs/queue";

export interface NotifyInput {
  userId: string;
  templateKey: string;
  vars: Record<string, string | number | null | undefined>;
  /** Stable key for the business event. Webhook retries produce the same key and therefore no duplicates. */
  dedupeKey: string;
  channels?: NotificationChannel[];
  link?: string;
}

/**
 * Records notifications (one per channel) idempotently and queues external delivery.
 * IN_APP is stored as SENT immediately; EMAIL/SMS/WHATSAPP are delivered by the worker with retries.
 */
export async function notify(db: DbClient, input: NotifyInput): Promise<number> {
  const channels = input.channels ?? ["IN_APP", "EMAIL"];
  let created = 0;
  for (const channel of channels) {
    const tpl =
      (await db.notificationTemplate.findUnique({ where: { key_channel: { key: input.templateKey, channel } } })) ??
      (DEFAULT_TEMPLATES[input.templateKey] ? { ...DEFAULT_TEMPLATES[input.templateKey], active: true } : null);
    if (!tpl || tpl.active === false) continue;
    const dedupeKey = `${input.dedupeKey}:${channel}`;
    const existing = await db.notification.findUnique({ where: { dedupeKey } });
    if (existing) continue;
    const n = await db.notification.create({
      data: {
        userId: input.userId, channel, templateKey: input.templateKey,
        subject: render(tpl.subject, input.vars), body: render(tpl.body, input.vars),
        link: input.link, dedupeKey,
        status: channel === "IN_APP" ? "SENT" : "QUEUED",
        sentAt: channel === "IN_APP" ? new Date() : null,
      },
    });
    if (channel !== "IN_APP") {
      await enqueueJob(db, "notification.deliver", { notificationId: n.id }, { dedupeKey: `deliver:${n.id}` });
    }
    created++;
  }
  return created;
}

/** Notify every user holding a staff role key (used for operational alerts). */
export async function notifyRole(db: DbClient, roleKey: string, input: Omit<NotifyInput, "userId">) {
  const users = await db.userRole.findMany({ where: { role: { key: roleKey } }, select: { userId: true } });
  for (const u of users) await notify(db, { ...input, userId: u.userId, dedupeKey: `${input.dedupeKey}:${u.userId}`, channels: input.channels ?? ["IN_APP"] });
}
