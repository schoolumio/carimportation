import { redirect } from "next/navigation";
import { requireActor } from "@/server/web/session";
import { PARTNER_ROLES, STAFF_ROLES } from "@/server/auth/permissions";

// Routes a freshly signed-in user to the most relevant dashboard.
export default async function PostLogin() {
  const a = await requireActor();
  if (a.roles.some((r) => STAFF_ROLES.includes(r))) redirect("/admin");
  if (a.roles.some((r) => PARTNER_ROLES.includes(r))) redirect("/partner");
  if (a.roles.includes("DEALER")) redirect("/dealer");
  redirect("/account");
}
