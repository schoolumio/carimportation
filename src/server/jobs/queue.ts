import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { prisma } from "@/server/db";
import { tbl } from "@/server/db-schema";

export async function enqueueJob(
  db: DbClient,
  type: string,
  payload: Prisma.InputJsonValue,
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
) {
  if (opts.dedupeKey) {
    const existing = await db.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  return db.job.create({
    data: { type, payload, dedupeKey: opts.dedupeKey, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 },
  });
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/** Claim the next due job using FOR UPDATE SKIP LOCKED so several workers can run safely. */
export async function claimNextJob(workerId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE ${tbl("Job")} SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM ${tbl("Job")} WHERE status IN ('PENDING','FAILED') AND "runAt" <= now()
      ORDER BY "runAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING id`;
  if (!rows.length) return null;
  return prisma.job.findUniqueOrThrow({ where: { id: rows[0].id } });
}

export function backoffMs(attempt: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** (attempt - 1)); // 30s, 1m, 2m, ... capped at 1h
}

export async function runJob(job: { id: string; type: string; payload: Prisma.JsonValue; attempts: number; maxAttempts: number }, handlers: Record<string, JobHandler>) {
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    await handler((job.payload ?? {}) as Record<string, unknown>);
    await prisma.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", lockedAt: null, lastError: null } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dead = job.attempts >= job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: { status: dead ? "DEAD" : "FAILED", lastError: msg.slice(0, 1000), lockedAt: null, runAt: new Date(Date.now() + backoffMs(job.attempts)) },
    });
  }
}

/** Process all currently-due jobs (used by the worker loop and by tests). */
export async function drainJobs(handlers: Record<string, JobHandler>, workerId = "inline", max = 500): Promise<number> {
  let n = 0;
  while (n < max) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    await runJob(job, handlers);
    n++;
  }
  return n;
}
