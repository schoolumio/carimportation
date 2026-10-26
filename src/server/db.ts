import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : process.env.NODE_ENV === "test" ? [] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type DbClient = PrismaClient | Tx;

// Interactive transactions make sequential round trips; on a distant hosted database (high latency) a large
// workflow step can take tens of seconds. Override with DB_TRANSACTION_TIMEOUT_MS if needed.
const TX_TIMEOUT_MS = Number(process.env.DB_TRANSACTION_TIMEOUT_MS) || 60000;

/** Run fn inside a transaction (ReadCommitted + explicit row locks where needed). */
export function transaction<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number }): Promise<T> {
  return prisma.$transaction(fn, { timeout: opts?.timeout ?? TX_TIMEOUT_MS, maxWait: 20000 });
}
