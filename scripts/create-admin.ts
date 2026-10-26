// Create the first super administrator on a fresh production database.
// Usage: npx tsx --env-file=.env scripts/create-admin.ts admin@company.com "Full Name"
// The password is read from the ADMIN_PASSWORD environment variable (never pass it on the command line).
import { prisma } from "../src/server/db";
import { syncRolesAndPermissions } from "../src/server/admin/bootstrap";
import { hashPassword, passwordPolicyError } from "../src/server/auth/password";

async function main() {
  const [email, fullName] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !fullName) throw new Error("Usage: create-admin.ts <email> <full name>  (ADMIN_PASSWORD env var required)");
  const policy = passwordPolicyError(password);
  if (policy) throw new Error(policy);
  await syncRolesAndPermissions(prisma);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const u = await prisma.user.create({ data: { email: email.toLowerCase(), fullName, passwordHash: await hashPassword(password), roles: { create: { roleId: role.id } } } });
  console.log(`Created super administrator ${u.email}. Sign in and enable MFA immediately.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
