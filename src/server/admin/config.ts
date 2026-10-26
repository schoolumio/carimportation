import type { DbClient } from "@/server/db";
import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";

// Defaults for configurable platform behaviour. Override in SystemConfig (admin → Settings).
export const CONFIG_DEFAULTS = {
  "quotes.validityHours": 72,
  "quotes.fxUncertaintyPercent": 5,
  "quotes.allowFixedPrice": true,
  "quotes.termsVersion": "2026-10-pilot-v1",
  "orders.inspectionPeriodHours": 72,
  "orders.paymentWindowHours": 72,
  "kyc.identityRequiredAboveNGN": 0, // 0 => identity verification always required before payment
  "kyc.eddRequiredAboveNGN": 100000000,
  "settlement.vehicleReleaseOnPurchasePercent": 70,
  "disputes.responseDays": 3,
  "payments.manualPilotEnabled": true,
  "payments.manualPilotAccount": {
    bankName: "PILOT ACCOUNT — NOT CONFIGURED",
    accountName: "To be confirmed after legal review",
    accountNumber: "0000000000",
    note: "Pilot payments may only be accepted under a documented, legally reviewed arrangement.",
  },
  "eta.stageDays": {
    sourcing: [3, 14],
    auction: [2, 10],
    inspection: [2, 5],
    exportPrep: [5, 14],
    clearance: [7, 21],
    localDelivery: [1, 3],
  },
  "listings.defaultExpiryDays": 60,
  "sla.milestoneStaleDays": 10,
} as const;

export type ConfigKey = keyof typeof CONFIG_DEFAULTS;
type ConfigValue<K extends ConfigKey> = (typeof CONFIG_DEFAULTS)[K] extends number
  ? number
  : (typeof CONFIG_DEFAULTS)[K] extends boolean
    ? boolean
    : (typeof CONFIG_DEFAULTS)[K] extends string
      ? string
      : (typeof CONFIG_DEFAULTS)[K];

export async function getConfig<K extends ConfigKey>(key: K, db: DbClient = prisma): Promise<ConfigValue<K>> {
  const row = await db.systemConfig.findUnique({ where: { key } });
  return (row ? row.value : CONFIG_DEFAULTS[key]) as ConfigValue<K>;
}

export async function setConfig(db: DbClient, key: ConfigKey, value: unknown, userId: string | null) {
  await db.systemConfig.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: userId },
    update: { value: value as Prisma.InputJsonValue, updatedById: userId },
  });
}
