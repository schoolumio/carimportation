"use server";
import { redirect } from "next/navigation";
import { completeMfa, login, registerBuyer, requestPasswordReset, resetPassword, revokeSession } from "@/server/auth/service";
import { clearSessionCookie, getSession, requestContext, setSessionCookie } from "@/server/web/session";
import { errorMessage, str } from "@/server/web/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";

function safeNext(n: string) {
  return n.startsWith("/") && !n.startsWith("//") ? n : "/account";
}

export async function loginAction(fd: FormData) {
  const next = safeNext(str(fd, "next") || "/account");
  try {
    const ctx = await requestContext();
    const res = await login(str(fd, "email"), str(fd, "password"), ctx);
    await setSessionCookie(res.token);
    if (res.status === "mfa_required") redirect(`/mfa?next=${encodeURIComponent(next)}`);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect(`/login?error=${encodeURIComponent(errorMessage(e))}&next=${encodeURIComponent(next)}`);
  }
  redirect(next === "/account" ? "/post-login" : next);
}

export async function mfaAction(fd: FormData) {
  const next = safeNext(str(fd, "next") || "/post-login");
  const s = await getSession();
  if (!s) redirect("/login");
  let ok = false;
  try {
    ok = await completeMfa(s.token, str(fd, "code").trim());
  } catch (e) {
    redirect(`/mfa?error=${encodeURIComponent(errorMessage(e))}`);
  }
  if (!ok) redirect(`/mfa?error=${encodeURIComponent("Invalid code. Try again.")}&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function registerAction(fd: FormData) {
  try {
    if (str(fd, "terms") !== "on") throw new Error("Please accept the terms and privacy policy.");
    const ctx = await requestContext();
    await registerBuyer({ fullName: str(fd, "fullName"), email: str(fd, "email"), phone: str(fd, "phone"), password: str(fd, "password") }, ctx);
    const res = await login(str(fd, "email"), str(fd, "password"), ctx);
    await setSessionCookie(res.token);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect(`/register?error=${encodeURIComponent(e instanceof Error && e.message.startsWith("Please") ? e.message : errorMessage(e))}`);
  }
  redirect("/account?ok=" + encodeURIComponent("Welcome! Your account is ready."));
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await revokeSession(s.token);
  await clearSessionCookie();
  redirect("/");
}

export async function forgotAction(fd: FormData) {
  const ctx = await requestContext();
  const res = await requestPasswordReset(str(fd, "email"), ctx);
  // In development the token is shown so the flow can be tested without email delivery.
  redirect(`/forgot-password?sent=1${res.devToken ? `&dev=${res.devToken}` : ""}`);
}

export async function resetAction(fd: FormData) {
  const token = str(fd, "token");
  try {
    if (str(fd, "password") !== str(fd, "confirm")) throw new Error("Passwords do not match.");
    await resetPassword(token, str(fd, "password"));
  } catch (e) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(e instanceof Error && e.message === "Passwords do not match." ? e.message : errorMessage(e))}`);
  }
  redirect("/login?ok=" + encodeURIComponent("Password updated. Please sign in."));
}
