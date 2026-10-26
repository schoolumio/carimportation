import Link from "next/link";
import { requireActor } from "@/server/web/session";

const NAV = [
  ["/account", "Overview"], ["/account/orders", "Orders"], ["/account/quotes", "Quotes"], ["/account/sourcing", "Sourcing requests"], ["/account/saved", "Saved vehicles"],
  ["/account/disputes", "Disputes"], ["/account/support", "Support"], ["/account/notifications", "Notifications"], ["/account/profile", "Profile & security"],
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("/account");
  return (
    <div className="container-page py-8">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{actor.fullName}</p>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Account">
            {NAV.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:text-brand">{label}</Link>)}
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
