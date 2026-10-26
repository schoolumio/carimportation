import { z } from "zod";
import { prisma, transaction } from "@/server/db";
import { hashPassword, passwordPolicyError, verifyPassword } from "./password";
import { randomToken, sha256, encrypt, decrypt } from "@/lib/crypto";
import { DomainError, invalid, conflict } from "@/lib/errors";
import { audit } from "@/server/audit/audit";
import { generateTotpSecret, verifyTotp } from "./totp";
import type { Actor } from "./actor";
import { rateLimit } from "./rate-limit";
import { notify } from "@/server/notifications/notify";
import { env } from "@/config/env";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days, sliding
export const PRIVILEGED_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours for staff
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  password: z.string().min(10).max(200),
});

export async function registerBuyer(input: z.infer<typeof registerSchema>, ctx: { ip?: string } = {}) {
  const data = registerSchema.parse(input);
  const policy = passwordPolicyError(data.password);
  if (policy) throw invalid(policy);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw conflict("An account with this email already exists.");
  const passwordHash = await hashPassword(data.password);
  return transaction(async (tx) => {
    const buyerRole = await tx.role.findUniqueOrThrow({ where: { key: "BUYER" } });
    const user = await tx.user.create({
      data: {
        email: data.email, fullName: data.fullName, phone: data.phone || null, passwordHash,
        roles: { create: { roleId: buyerRole.id } },
        buyerProfile: { create: {} },
      },
    });
    await audit(tx, { actor: null, action: "user.register", entityType: "User", entityId: user.id, summary: `Buyer registered (${user.email})`, ip: ctx.ip });
    return user;
  });
}

export type LoginResult =
  | { status: "ok"; token: string; userId: string; mfaRequired: false }
  | { status: "mfa_required"; token: string; userId: string; mfaRequired: true };

export async function login(email: string, password: string, ctx: { ip?: string; userAgent?: string } = {}): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase();
  const rl = rateLimit(`login:${ctx.ip ?? "?"}:${normalized}`, 10, 15 * 60 * 1000);
  if (!rl.ok) throw new DomainError("RATE_LIMITED", "Too many sign-in attempts. Please wait and try again.");
  const user = await prisma.user.findUnique({ where: { email: normalized }, include: { roles: { include: { role: true } } } });
  const generic = new DomainError("UNAUTHENTICATED", "Incorrect email or password.");
  if (!user) {
    await hashPassword(password); // equalise timing
    throw generic;
  }
  if (user.status !== "ACTIVE") throw new DomainError("FORBIDDEN", "This account is not active. Contact support.");
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new DomainError("FORBIDDEN", "Account temporarily locked after repeated failed attempts. Try again later or reset your password.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null },
    });
    await audit(prisma, { actor: null, action: "auth.login_failed", entityType: "User", entityId: user.id, summary: "Failed sign-in", ip: ctx.ip });
    throw generic;
  }
  const privileged = user.roles.some((r) => r.role.privileged);
  const token = randomToken(32);
  await prisma.session.create({
    data: {
      userId: user.id, tokenHash: sha256(token), ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300),
      mfaVerified: !user.mfaEnabled,
      expiresAt: new Date(Date.now() + (privileged ? PRIVILEGED_SESSION_TTL_MS : SESSION_TTL_MS)),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit(prisma, { actor: null, action: "auth.login", entityType: "User", entityId: user.id, summary: "Signed in", ip: ctx.ip, userAgent: ctx.userAgent });
  if (user.mfaEnabled) return { status: "mfa_required", token, userId: user.id, mfaRequired: true };
  return { status: "ok", token, userId: user.id, mfaRequired: false };
}

export async function validateSession(token: string) {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  // Throttle lastSeen writes to once per 5 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session;
}

export async function completeMfa(token: string, code: string): Promise<boolean> {
  const session = await validateSession(token);
  if (!session) return false;
  const rl = rateLimit(`mfa:${session.id}`, 6, 10 * 60 * 1000);
  if (!rl.ok) throw new DomainError("RATE_LIMITED", "Too many attempts.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!user.mfaEnabled || !user.mfaSecretEnc) return false;
  if (!verifyTotp(decrypt(user.mfaSecretEnc), code)) return false;
  await prisma.session.update({ where: { id: session.id }, data: { mfaVerified: true } });
  return true;
}

export async function revokeSession(token: string) {
  await prisma.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeSessionById(actor: Actor, sessionId: string) {
  await prisma.session.updateMany({ where: { id: sessionId, userId: actor.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(prisma, { actor, action: "auth.session_revoked", entityType: "Session", entityId: sessionId, summary: "Session revoked by user" });
}

export async function revokeAllSessions(userId: string, exceptTokenHash?: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/** Always returns success to the caller to avoid account enumeration. */
export async function requestPasswordReset(email: string, ctx: { ip?: string } = {}): Promise<{ devToken?: string }> {
  const rl = rateLimit(`reset:${ctx.ip ?? "?"}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return {};
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.status !== "ACTIVE") return {};
  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000), requestIp: ctx.ip },
  });
  const link = `${env().APP_URL}/reset-password?token=${token}`;
  await notify(prisma, {
    userId: user.id, templateKey: "auth.password_reset", channels: ["EMAIL"],
    vars: { link }, dedupeKey: `pwreset:${sha256(token)}`,
  });
  await audit(prisma, { actor: null, action: "auth.password_reset_requested", entityType: "User", entityId: user.id, summary: "Password reset requested", ip: ctx.ip });
  return env().NODE_ENV !== "production" ? { devToken: token } : {};
}

export async function resetPassword(token: string, newPassword: string) {
  const policy = passwordPolicyError(newPassword);
  if (policy) throw invalid(policy);
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw invalid("This reset link is invalid or has expired.");
  const passwordHash = await hashPassword(newPassword);
  await transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: rec.userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
    await tx.session.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, { actor: null, action: "auth.password_reset", entityType: "User", entityId: rec.userId, summary: "Password reset; all sessions revoked" });
  });
}

export async function changePassword(actor: Actor, current: string, next: string, currentTokenHash?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw invalid("Current password is incorrect.");
  const policy = passwordPolicyError(next);
  if (policy) throw invalid(policy);
  await prisma.user.update({ where: { id: actor.userId }, data: { passwordHash: await hashPassword(next) } });
  await revokeAllSessions(actor.userId, currentTokenHash);
  await audit(prisma, { actor, action: "auth.password_changed", entityType: "User", entityId: actor.userId, summary: "Password changed; other sessions revoked" });
}

export async function beginMfaEnrollment(actor: Actor): Promise<string> {
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: actor.userId }, data: { mfaSecretEnc: encrypt(secret), mfaEnabled: false } });
  return secret;
}

export async function confirmMfaEnrollment(actor: Actor, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!user.mfaSecretEnc) throw invalid("Start MFA enrolment first.");
  if (!verifyTotp(decrypt(user.mfaSecretEnc), code)) throw invalid("That code is not valid. Check your device clock and try again.");
  await prisma.user.update({ where: { id: actor.userId }, data: { mfaEnabled: true } });
  await audit(prisma, { actor, action: "auth.mfa_enabled", entityType: "User", entityId: actor.userId, summary: "MFA enabled" });
}
