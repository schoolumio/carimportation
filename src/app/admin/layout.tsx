import Link from "next/link";
import { requireStaff } from "@/server/web/session";
import { Notice } from "@/components/ui";
import type { Permission } from "@/server/auth/permissions";

const NAV: [string, string, Permission | null][] = [
  ["/admin", "Overview", null], ["/admin/orders", "Orders", "order.view.all"], ["/admin/listings", "Listings", "listing.moderate"], ["/admin/dealers", "Dealers", "dealer.verify"],
  ["/admin/compliance", "Compliance", "compliance.review"], ["/admin/finance", "Finance & escrow", "ledger.view"], ["/admin/disputes", "Disputes", "dispute.manage"],
  ["/admin/costs", "Cost approvals", "cost.review"], ["/admin/sourcing", "Sourcing", "sourcing.offer"], ["/admin/support", "Support", "support.manage"], ["/admin/flags", "Trust & safety", "listing.moderate"],
  ["/admin/pricing", "Pricing rules", "pricing.manage"], ["/admin/users", "Users & roles", "user.manage"], ["/admin/settings", "Settings", "config.manage"],
  ["/admin/notifications", "Notifications & jobs", "config.manage"], ["/admin/audit", "Audit log", "audit.view"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireStaff();
  const privileged = actor.roles.some((r) => r !== "SUPPORT");
  const { prisma } = await import("@/server/db");
  const mfa = (await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { mfaEnabled: true } })).mfaEnabled;
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      {privileged && !mfa && <div className="mb-4"><Notice tone="warning" title="Enable two-factor authentication">Your account has privileged access. <Link className="link" href="/account/profile">Set up MFA</Link>. Production deployments should enforce this.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
        <aside>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operations console · {actor.roles.join(", ").toLowerCase()}</p>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
            {NAV.filter(([, , p]) => !p || actor.permissions.has(p)).map(([h, l]) => <Link key={h} href={h} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white hover:text-brand">{l}</Link>)}
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
