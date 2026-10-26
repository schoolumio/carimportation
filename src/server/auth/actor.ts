import type { DbClient } from "@/server/db";
import { prisma } from "@/server/db";
import { forbidden } from "@/lib/errors";
import type { Permission, RoleKey } from "./permissions";
import { STAFF_ROLES } from "./permissions";

/** The authenticated principal on whose behalf a service call runs. */
export interface Actor {
  kind: "user";
  userId: string;
  email: string;
  fullName: string;
  roles: RoleKey[];
  permissions: Set<Permission>;
  dealerOrgIds: string[];
  mfaVerified: boolean;
}

export interface SystemActor {
  kind: "system";
  reason: string;
}

export type AnyActor = Actor | SystemActor;

export const SYSTEM = (reason: string): SystemActor => ({ kind: "system", reason });

export async function loadActor(userId: string, opts: { mfaVerified?: boolean; db?: DbClient } = {}): Promise<Actor | null> {
  const db = opts.db ?? prisma;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      dealerMemberships: true,
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  const roles = user.roles.map((r) => r.role.key as RoleKey);
  const permissions = new Set<Permission>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.key as Permission);
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    roles,
    permissions,
    dealerOrgIds: user.dealerMemberships.map((m) => m.orgId),
    mfaVerified: opts.mfaVerified ?? false,
  };
}

export function can(actor: AnyActor, perm: Permission): boolean {
  if (actor.kind === "system") return true;
  return actor.permissions.has(perm);
}

export function requirePermission(actor: AnyActor, perm: Permission): void {
  if (!can(actor, perm)) throw forbidden(`Missing permission: ${perm}`);
}

export function requireUser(actor: AnyActor): Actor {
  if (actor.kind !== "user") throw forbidden("A signed-in user is required.");
  return actor;
}

export function hasRole(actor: AnyActor, role: RoleKey): boolean {
  return actor.kind === "user" && actor.roles.includes(role);
}

export function isStaff(actor: AnyActor): boolean {
  return actor.kind === "user" && actor.roles.some((r) => STAFF_ROLES.includes(r));
}

export function actorId(actor: AnyActor): string | null {
  return actor.kind === "user" ? actor.userId : null;
}

export function actorLabel(actor: AnyActor): string {
  return actor.kind === "user" ? actor.roles.join(",") || "USER" : `SYSTEM:${actor.reason}`;
}
