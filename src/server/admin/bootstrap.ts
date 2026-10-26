import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, type RoleKey } from "@/server/auth/permissions";

/** Idempotently sync role and permission definitions from code into the database. */
export async function syncRolesAndPermissions(db: PrismaClient) {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  const perms = await db.permission.findMany();
  const byKey = new Map(perms.map((p) => [p.key, p.id]));
  for (const [key, meta] of Object.entries(ROLES) as [RoleKey, (typeof ROLES)[RoleKey]][]) {
    const role = await db.role.upsert({
      where: { key },
      create: { key, name: meta.name, description: meta.description, privileged: meta.privileged },
      update: { name: meta.name, description: meta.description, privileged: meta.privileged },
    });
    const existing = await db.rolePermission.count({ where: { roleId: role.id } });
    // Only apply defaults to roles with no grants yet (or super admin, which always holds all), preserving admin edits.
    if (existing === 0 || key === "SUPER_ADMIN") {
      for (const p of ROLE_PERMISSIONS[key]) {
        await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: byKey.get(p)! } }, create: { roleId: role.id, permissionId: byKey.get(p)! }, update: {} });
      }
    }
  }
}
