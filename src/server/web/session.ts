// Bridges Next.js request context (cookies/headers) to the domain Actor model.
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { validateSession } from "@/server/auth/service";
import { loadActor, type Actor } from "@/server/auth/actor";
import type { Permission, RoleKey } from "@/server/auth/permissions";
import { STAFF_ROLES } from "@/server/auth/permissions";

export const SESSION_COOKIE = "av_session";

export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSession(token);
  if (!session) return null;
  return { session, token };
});

/** Current actor, or null. Sessions awaiting MFA do not authenticate. */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const s = await getSession();
  if (!s || !s.session.mfaVerified) return null;
  return loadActor(s.session.userId, { mfaVerified: s.session.mfaVerified });
});

export async function requireActor(next?: string): Promise<Actor> {
  const a = await currentActor();
  if (!a) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return a;
}

export async function requirePerm(perm: Permission): Promise<Actor> {
  const a = await requireActor();
  if (!a.permissions.has(perm)) redirect("/forbidden");
  return a;
}

export async function requireAnyRole(roles: RoleKey[]): Promise<Actor> {
  const a = await requireActor();
  if (!a.roles.some((r) => roles.includes(r))) redirect("/forbidden");
  return a;
}

export async function requireStaff(): Promise<Actor> {
  return requireAnyRole(STAFF_ROLES);
}

export async function requestContext() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined, userAgent: h.get("user-agent") ?? undefined };
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
