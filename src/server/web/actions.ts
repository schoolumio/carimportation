// Helpers for server actions: consistent error → redirect-with-message handling.
import "server-only";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ZodError } from "zod";
import { isDomainError } from "@/lib/errors";

export function errorMessage(e: unknown): string {
  if (isDomainError(e)) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  console.error(e);
  return "Something went wrong. Please try again or contact support.";
}

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const p = new URLSearchParams(query);
  p.delete("error");
  p.delete("ok");
  p.set(key, value);
  return `${base}?${p.toString()}`;
}

/** Run an action; on success redirect with ?ok=, on failure redirect back with ?error=. */
export async function act(back: string, fn: () => Promise<unknown>, okMessage = "Saved.", successPath?: string) {
  try {
    await fn();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect(withParam(back, "error", errorMessage(e)));
  }
  redirect(withParam(successPath ?? back, "ok", okMessage));
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function strs(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
}

export async function fileFrom(fd: FormData, key: string): Promise<{ filename: string; mimeType: string; data: Buffer } | null> {
  const f = fd.get(key);
  if (!f || typeof f === "string" || f.size === 0) return null;
  return { filename: f.name, mimeType: f.type, data: Buffer.from(await f.arrayBuffer()) };
}
