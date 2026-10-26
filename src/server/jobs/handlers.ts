import { deliverNotification } from "@/server/notifications/deliver";
import { processAcceptanceExpiry } from "@/server/orders/service";
import { expireStaleQuotes } from "@/server/quotes/service";
import { expireListings } from "@/server/inventory/service";
import { runReconciliation } from "@/server/payments/reconciliation";
import { SYSTEM } from "@/server/auth/actor";
import type { JobHandler } from "./queue";

export const JOB_HANDLERS: Record<string, JobHandler> = {
  "notification.deliver": async (p) => deliverNotification(String(p.notificationId)),
  "order.acceptanceExpiry": async (p) => {
    await processAcceptanceExpiry(String(p.orderId));
  },
  "maintenance.expireQuotes": async () => {
    await expireStaleQuotes();
  },
  "maintenance.expireListings": async () => {
    await expireListings();
  },
  "finance.dailyReconciliation": async (p) => {
    const end = p.periodEnd ? new Date(String(p.periodEnd)) : new Date();
    const start = new Date(end.getTime() - 86400_000);
    await runReconciliation(SYSTEM("daily-reconciliation"), "SANDBOX", start, end);
  },
};
