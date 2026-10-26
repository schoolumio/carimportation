import type { NotificationChannel } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { DEFAULT_TEMPLATES, render } from "./templates";

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
  const keys = channels.map((c) => `${input.dedupeKey}:${c}`);
  // Two reads for all channels (template overrides + already-sent check) keep round trips low on remote databases.
  const [overrides, existing] = await Promise.all([
    db.notificationTemplate.findMany({ where: { key: input.templateKey, channel: { in: channels } } }),
    db.notification.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } }),
  ]);
  const done = new Set(existing.map((e) => e.dedupeKey));
  let created = 0;
  for (const channel of channels) {
    const tpl =
      overrides.find((t) => t.channel === channel) ??
      (DEFAULT_TEMPLATES[input.templateKey] ? { ...DEFAULT_TEMPLATES[input.templateKey], active: true } : null);
    if (!tpl || tpl.active === false) continue;
    const dedupeKey = `${input.dedupeKey}:${channel}`;
    if (done.has(dedupeKey)) continue;
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
      // The notification id is new, so its delivery job cannot already exist.
      await db.job.create({ data: { type: "notification.deliver", payload: { notificationId: n.id }, dedupeKey: `deliver:${n.id}` } });
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
