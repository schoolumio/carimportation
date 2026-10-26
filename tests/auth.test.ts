import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeUser, prisma } from "./helpers";
import { registerBuyer, login, validateSession, requestPasswordReset, resetPassword, revokeSession, beginMfaEnrollment, confirmMfaEnrollment, completeMfa } from "@/server/auth/service";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { totpAt } from "@/server/auth/totp";
import { loadActor, can } from "@/server/auth/actor";

describe("authentication", () => {
  beforeEach(resetDb);

  it("hashes passwords with scrypt and verifies them", async () => {
    const h = await hashPassword("correct horse 1");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse 1", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("registers a buyer with the BUYER role and logs in", async () => {
    const u = await registerBuyer({ fullName: "Ada Obi", email: "Ada@Example.com", password: "s3cure-password" });
    expect(u.email).toBe("ada@example.com");
    const actor = await loadActor(u.id);
    expect(actor?.roles).toEqual(["BUYER"]);
    const res = await login("ada@example.com", "s3cure-password");
    expect(res.status).toBe("ok");
    expect(await validateSession(res.token)).not.toBeNull();
  });

  it("rejects duplicate emails and weak passwords", async () => {
    await registerBuyer({ fullName: "A B", email: "a@example.com", password: "s3cure-password" });
    await expect(registerBuyer({ fullName: "A B", email: "a@example.com", password: "s3cure-password" })).rejects.toThrow(/already exists/);
    await expect(registerBuyer({ fullName: "A B", email: "b@example.com", password: "onlyletters" })).rejects.toThrow();
  });

  it("locks the account after repeated failures", async () => {
    await registerBuyer({ fullName: "A B", email: "lock@example.com", password: "s3cure-password" });
    for (let i = 0; i < 5; i++) await expect(login("lock@example.com", "bad-password-1")).rejects.toThrow(/Incorrect/);
    await expect(login("lock@example.com", "s3cure-password")).rejects.toThrow(/locked/);
  });

  it("revokes sessions on logout and on password reset", async () => {
    await registerBuyer({ fullName: "A B", email: "r@example.com", password: "s3cure-password" });
    const s1 = await login("r@example.com", "s3cure-password");
    await revokeSession(s1.token);
    expect(await validateSession(s1.token)).toBeNull();
    const s2 = await login("r@example.com", "s3cure-password");
    const { devToken } = await requestPasswordReset("r@example.com");
    expect(devToken).toBeTruthy();
    await resetPassword(devToken!, "new-passw0rd-x");
    expect(await validateSession(s2.token)).toBeNull();
    await expect(resetPassword(devToken!, "another-passw0rd")).rejects.toThrow(/invalid or has expired/);
    expect((await login("r@example.com", "new-passw0rd-x")).status).toBe("ok");
  });

  it("does not reveal whether an email exists on reset", async () => {
    expect(await requestPasswordReset("nobody@example.com")).toEqual({});
  });

  it("supports TOTP MFA and requires it at sign-in once enabled", async () => {
    const admin = await makeUser(["FINANCE"], { email: "fin@example.com", password: "s3cure-password" });
    const secret = await beginMfaEnrollment(admin);
    await expect(confirmMfaEnrollment(admin, "000000")).rejects.toThrow();
    await confirmMfaEnrollment(admin, totpAt(secret, Date.now()));
    const res = await login("fin@example.com", "s3cure-password");
    expect(res.status).toBe("mfa_required");
    const session = await validateSession(res.token);
    expect(session?.mfaVerified).toBe(false);
    expect(await completeMfa(res.token, totpAt(secret, Date.now()))).toBe(true);
    expect((await validateSession(res.token))?.mfaVerified).toBe(true);
  });

  it("loads permissions from roles in the database", async () => {
    const buyer = await makeUser(["BUYER"]);
    const finance = await makeUser(["FINANCE"]);
    expect(can(buyer, "refund.approve")).toBe(false);
    expect(can(finance, "refund.approve")).toBe(true);
    const suspended = await makeUser(["BUYER"]);
    await prisma.user.update({ where: { id: suspended.userId }, data: { status: "SUSPENDED" } });
    expect(await loadActor(suspended.userId)).toBeNull();
  });
});
