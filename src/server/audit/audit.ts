import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { sha256 } from "@/lib/crypto";
import type { AnyActor } from "@/server/auth/actor";

/** Canonical JSON (recursively sorted keys) so hashes survive JSONB key reordering. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

function chainHash(prevHash: string, actorId: string | null, actorRoles: string[], action: string, entityType: string, entityId: string, summary: string, before: unknown, after: unknown, createdAt: Date) {
  return sha256(canonical([prevHash, actorId, actorRoles, action, entityType, entityId, summary, before ?? null, after ?? null, createdAt.toISOString()]));
}

export interface AuditInput {
  actor: AnyActor | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)));
}

/**
 * Append a hash-chained audit event. The AuditLog table is append-only (DB trigger).
 * An advisory transaction lock serialises chain extension so hashes are verifiable.
 */
export async function audit(db: DbClient, input: AuditInput): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(7419001)`;
  const last = await db.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? "GENESIS";
  const actorId = input.actor?.kind === "user" ? input.actor.userId : null;
  const actorRoles = input.actor?.kind === "user" ? input.actor.roles : input.actor ? [`SYSTEM:${input.actor.reason}`] : ["ANONYMOUS"];
  const before = toJson(input.before);
  const after = toJson(input.after);
  const createdAt = new Date();
  const hash = chainHash(prevHash, actorId, actorRoles, input.action, input.entityType, input.entityId, input.summary, before, after, createdAt);
  await db.auditLog.create({
    data: {
      actorId, actorRoles, action: input.action, entityType: input.entityType, entityId: input.entityId,
      summary: input.summary, before, after, ip: input.ip ?? null, userAgent: input.userAgent ?? null,
      prevHash, hash, createdAt,
    },
  });
}

/** Recompute the chain and report the first broken link (tamper evidence). */
export async function verifyAuditChain(db: DbClient): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
  const rows = await db.auditLog.findMany({ orderBy: { seq: "asc" } });
  let prev = "GENESIS";
  for (const r of rows) {
    const expected = chainHash(prev, r.actorId, r.actorRoles, r.action, r.entityType, r.entityId, r.summary, r.before, r.after, r.createdAt);
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false, checked: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
