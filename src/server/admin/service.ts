import type { CalcType, ChargeNature, Beneficiary, PayableStage, NotificationChannel, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, transaction } from "@/server/db";
import { D } from "@/lib/money";
import { conflict, forbidden, invalid, notFound, precondition } from "@/lib/errors";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit/audit";
import { hashPassword, passwordPolicyError } from "@/server/auth/password";
import { PROTECTED_PERMISSIONS, ROLES, type Permission, type RoleKey } from "@/server/auth/permissions";
import { CONFIG_DEFAULTS, setConfig, type ConfigKey } from "./config";

export async function grantRole(actor: Actor, userId: string, roleKey: RoleKey) {
  requirePermission(actor, "user.manage");
  if (actor.userId === userId) throw forbidden("You cannot change your own roles.");
  if (!(roleKey in ROLES)) throw invalid("Unknown role.");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, create: { userId, roleId: role.id, grantedBy: actor.userId }, update: {} });
  // Privilege change: force re-authentication.
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(prisma, { actor, action: "user.role_granted", entityType: "User", entityId: userId, summary: `Granted ${roleKey}` });
}

export async function revokeRole(actor: Actor, userId: string, roleKey: RoleKey) {
  requirePermission(actor, "user.manage");
  if (actor.userId === userId) throw forbidden("You cannot change your own roles.");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  if (roleKey === "SUPER_ADMIN") {
    const admins = await prisma.userRole.count({ where: { roleId: role.id } });
    if (admins <= 1) throw precondition("At least one super administrator must remain.");
  }
  await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(prisma, { actor, action: "user.role_revoked", entityType: "User", entityId: userId, summary: `Revoked ${roleKey}` });
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED" | "LOCKED") {
  requirePermission(actor, "user.manage");
  if (actor.userId === userId) throw forbidden("You cannot change your own status.");
  await prisma.user.update({ where: { id: userId }, data: { status, ...(status === "ACTIVE" ? { failedLoginCount: 0, lockedUntil: null } : {}) } });
  if (status !== "ACTIVE") await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(prisma, { actor, action: "user.status", entityType: "User", entityId: userId, summary: `Status → ${status}` });
}

export async function createStaffUser(actor: Actor, input: { email: string; fullName: string; password: string; role: RoleKey }) {
  requirePermission(actor, "user.manage");
  const pw = passwordPolicyError(input.password);
  if (pw) throw invalid(pw);
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw conflict("Email already in use.");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: input.role } });
  const u = await prisma.user.create({ data: { email, fullName: input.fullName.trim(), passwordHash: await hashPassword(input.password), roles: { create: { roleId: role.id, grantedBy: actor.userId } } } });
  await audit(prisma, { actor, action: "user.created", entityType: "User", entityId: u.id, summary: `Created ${email} with role ${input.role}` });
  return u;
}

export async function setRolePermission(actor: Actor, roleKey: RoleKey, permission: Permission, granted: boolean) {
  requirePermission(actor, "user.manage");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  if (granted && PROTECTED_PERMISSIONS.includes(permission) && !role.privileged) throw forbidden("Protected permissions cannot be granted to non-privileged roles.");
  if (roleKey === "SUPER_ADMIN") throw forbidden("Super administrator permissions are fixed.");
  const perm = await prisma.permission.findUniqueOrThrow({ where: { key: permission } });
  if (granted) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }, create: { roleId: role.id, permissionId: perm.id }, update: {} });
  else await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: perm.id } });
  await audit(prisma, { actor, action: "role.permission_changed", entityType: "Role", entityId: role.id, summary: `${roleKey}: ${granted ? "+" : "-"}${permission}` });
}

// ─── Pricing rules ──────────────────────────────────────────────────────────

export const pricingRuleSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9_]{3,40}$/, "Use UPPER_SNAKE_CASE"),
  label: z.string().trim().min(3).max(120),
  category: z.string().trim().min(3).max(40),
  calcType: z.enum(["FIXED_AMOUNT", "PERCENT_OF_VEHICLE", "PERCENT_OF_CIF", "PERCENT_OF_DUTIABLE", "PERCENT_OF_SUBTOTAL"]),
  amount: z.string().optional().or(z.literal("")),
  currency: z.string().length(3).optional().or(z.literal("")),
  percent: z.string().optional().or(z.literal("")),
  conditions: z.string().default("{}"),
  nature: z.enum(["FIXED", "QUOTED", "ESTIMATED", "VARIABLE"]),
  refundable: z.boolean().default(false),
  beneficiary: z.string(),
  payableStage: z.enum(["UPFRONT", "ON_ARRIVAL", "ON_DELIVERY"]).default("UPFRONT"),
  uncertaintyPercent: z.string().default("0"),
  sourceReference: z.string().trim().min(5).max(500),
  optional: z.boolean().default(false),
  effectiveFrom: z.coerce.date(),
});

/** Pricing rules are versioned: edits create a new version; the previous version is closed, never overwritten. */
export async function savePricingRule(actor: Actor, raw: z.input<typeof pricingRuleSchema>) {
  requirePermission(actor, "pricing.manage");
  const d = pricingRuleSchema.parse(raw);
  let conditions: Prisma.InputJsonValue;
  try {
    conditions = JSON.parse(d.conditions || "{}");
  } catch {
    throw invalid("Conditions must be valid JSON.");
  }
  if (d.calcType === "FIXED_AMOUNT" && (!d.amount || !d.currency)) throw invalid("Fixed amounts need an amount and currency.");
  if (d.calcType !== "FIXED_AMOUNT" && !d.percent) throw invalid("Percentage rules need a percentage.");
  return transaction(async (tx) => {
    const latest = await tx.pricingRule.findFirst({ where: { code: d.code }, orderBy: { version: "desc" } });
    if (latest) await tx.pricingRule.updateMany({ where: { code: d.code, effectiveTo: null }, data: { effectiveTo: d.effectiveFrom } });
    const rule = await tx.pricingRule.create({
      data: {
        code: d.code, version: (latest?.version ?? 0) + 1, label: d.label, category: d.category, calcType: d.calcType as CalcType,
        amount: d.amount ? new D(d.amount) : null, currency: d.currency || null, percent: d.percent ? new D(d.percent) : null, conditions,
        nature: d.nature as ChargeNature, refundable: d.refundable, beneficiary: d.beneficiary as Beneficiary, payableStage: d.payableStage as PayableStage,
        uncertaintyPercent: new D(d.uncertaintyPercent || "0"), sourceReference: d.sourceReference, optional: d.optional,
        effectiveFrom: d.effectiveFrom, createdById: actor.userId, sortOrder: latest?.sortOrder ?? 0,
      },
    });
    await audit(tx, { actor, action: "pricing.rule_saved", entityType: "PricingRule", entityId: rule.id, summary: `${d.code} v${rule.version} saved (unverified)` });
    return rule;
  });
}

/** Mark a rule as verified against the cited official/contracted source. Required before fixed-price quotes. */
export async function verifyPricingRule(actor: Actor, ruleId: string) {
  requirePermission(actor, "pricing.manage");
  const r = await prisma.pricingRule.findUnique({ where: { id: ruleId } });
  if (!r) throw notFound("Rule");
  if (r.createdById === actor.userId) throw forbidden("A different administrator must verify this rule.");
  await prisma.pricingRule.update({ where: { id: ruleId }, data: { verifiedAt: new Date(), verifiedById: actor.userId } });
  await audit(prisma, { actor, action: "pricing.rule_verified", entityType: "PricingRule", entityId: ruleId, summary: `${r.code} v${r.version} verified against: ${r.sourceReference}` });
}

export async function setRuleActive(actor: Actor, ruleId: string, active: boolean) {
  requirePermission(actor, "pricing.manage");
  await prisma.pricingRule.update({ where: { id: ruleId }, data: { active } });
  await audit(prisma, { actor, action: "pricing.rule_active", entityType: "PricingRule", entityId: ruleId, summary: active ? "Activated" : "Deactivated" });
}

export async function addFxSnapshot(actor: Actor, input: { base: string; rate: string; source: string }) {
  requirePermission(actor, "pricing.manage");
  const rate = new D(input.rate);
  if (!rate.gt(0)) throw invalid("Rate must be positive.");
  if (input.source.trim().length < 3) throw invalid("Cite the rate source.");
  const s = await prisma.exchangeRateSnapshot.create({ data: { base: input.base.toUpperCase(), quote: "NGN", rate, source: input.source.trim(), capturedAt: new Date() } });
  await audit(prisma, { actor, action: "fx.snapshot", entityType: "ExchangeRateSnapshot", entityId: s.id, summary: `${s.base}/NGN ${rate.toFixed(4)} (${s.source})` });
  return s;
}

export async function updateConfig(actor: Actor, key: ConfigKey, rawValue: string) {
  requirePermission(actor, "config.manage");
  if (!(key in CONFIG_DEFAULTS)) throw invalid("Unknown setting.");
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    throw invalid("Value must be valid JSON.");
  }
  const def = CONFIG_DEFAULTS[key];
  if (typeof def !== typeof value || Array.isArray(def) !== Array.isArray(value)) throw invalid(`Value must be of type ${typeof def}.`);
  await setConfig(prisma, key, value, actor.userId);
  await audit(prisma, { actor, action: "config.updated", entityType: "SystemConfig", entityId: key, summary: `${key} = ${rawValue.slice(0, 200)}` });
}

export async function upsertTemplate(actor: Actor, input: { key: string; channel: NotificationChannel; subject: string; body: string; active: boolean }) {
  requirePermission(actor, "config.manage");
  await prisma.notificationTemplate.upsert({ where: { key_channel: { key: input.key, channel: input.channel } }, create: input, update: input });
  await audit(prisma, { actor, action: "template.updated", entityType: "NotificationTemplate", entityId: `${input.key}:${input.channel}`, summary: "Template updated" });
}

export async function upsertSourceCountry(actor: Actor, input: { code: string; name: string; active: boolean; originPorts: string[]; transitDaysMin: number; transitDaysMax: number }) {
  requirePermission(actor, "config.manage");
  if (input.transitDaysMax < input.transitDaysMin) throw invalid("Transit range invalid.");
  await prisma.sourceCountry.upsert({ where: { code: input.code }, create: input, update: input });
  await audit(prisma, { actor, action: "config.country", entityType: "SourceCountry", entityId: input.code, summary: `${input.name} ${input.active ? "active" : "inactive"}` });
}

export async function upsertDeliveryLocation(actor: Actor, input: { code: string; name: string; state: string; active: boolean }) {
  requirePermission(actor, "config.manage");
  await prisma.deliveryLocation.upsert({ where: { code: input.code }, create: input, update: input });
  await audit(prisma, { actor, action: "config.location", entityType: "DeliveryLocation", entityId: input.code, summary: `${input.name}` });
}
