import Link from "next/link";
import { Car, Bell } from "lucide-react";
import { brand } from "@/config/brand";
import { currentActor } from "@/server/web/session";
import { prisma } from "@/server/db";
import { STAFF_ROLES, PARTNER_ROLES } from "@/server/auth/permissions";
import { logoutAction } from "@/app/(auth)/actions";

export async function Header() {
  const actor = await currentActor();
  const unread = actor ? await prisma.notification.count({ where: { userId: actor.userId, channel: "IN_APP", readAt: null } }) : 0;
  const links: { href: string; label: string }[] = [];
  if (actor) {
    if (actor.roles.includes("BUYER")) links.push({ href: "/account", label: "My account" });
    if (actor.roles.includes("DEALER")) links.push({ href: "/dealer", label: "Dealer" });
    if (actor.roles.some((r) => PARTNER_ROLES.includes(r))) links.push({ href: "/partner", label: "Partner" });
    if (actor.roles.some((r) => STAFF_ROLES.includes(r))) links.push({ href: "/admin", label: "Admin" });
  }
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><Car className="h-4 w-4" aria-hidden /></span>
          <span className="text-lg tracking-tight">{brand.name}</span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium text-slate-700 lg:flex" aria-label="Main">
          <Link href="/vehicles" className="hover:text-brand">Vehicles</Link>
          <Link href="/calculator" className="hover:text-brand">Cost calculator</Link>
          <Link href="/how-it-works" className="hover:text-brand">How it works</Link>
          <Link href="/payment-protection" className="hover:text-brand">Payment protection</Link>
          <Link href="/request-a-car" className="hover:text-brand">Request a car</Link>
          <Link href="/track" className="hover:text-brand">Track</Link>
        </nav>
        <div className="flex items-center gap-2">
          {actor ? (
            <>
              <Link href="/account/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread} unread)`}>
                <Bell className="h-5 w-5" aria-hidden />
                {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
              </Link>
              {links.map((l) => <Link key={l.href} href={l.href} className="btn-ghost btn-sm hidden sm:inline-flex">{l.label}</Link>)}
              <form action={logoutAction}><button className="btn-secondary btn-sm">Sign out</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm">Sign in</Link>
              <Link href="/register" className="btn-primary btn-sm">Create account</Link>
            </>
          )}
        </div>
      </div>
      <nav className="container-page flex gap-4 overflow-x-auto whitespace-nowrap pb-2 text-sm font-medium text-slate-700 lg:hidden" aria-label="Main mobile">
        <Link href="/vehicles">Vehicles</Link><Link href="/calculator">Calculator</Link><Link href="/how-it-works">How it works</Link><Link href="/payment-protection">Protection</Link><Link href="/track">Track</Link>
        {links.map((l) => <Link key={l.href} href={l.href} className="sm:hidden">{l.label}</Link>)}
      </nav>
    </header>
  );
}

export function EnvironmentBanner() {
  const provider = process.env.PAYMENT_PROVIDER ?? "SANDBOX";
  if (provider === "LIVE_PARTNER") return null;
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
      {provider === "MANUAL_PILOT"
        ? "Pilot: payments are verified manually by finance staff against bank statements. This is not automated escrow."
        : "Demonstration environment: listings, payments and tracking are simulated test data. No real money is accepted."}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-8 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-bold text-brand">{brand.name}</p>
          <p className="mt-2 text-slate-600">{brand.tagline}</p>
          <p className="mt-3 text-xs text-slate-500">{brand.legalEntity}. {brand.name} is a marketplace and coordination platform. It is not a bank, licensed escrow provider, shipping line or licensed customs agent; regulated services are provided by authorised partners where stated.</p>
        </div>
        <div>
          <p className="font-semibold">Buy</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            <li><Link href="/vehicles">Browse vehicles</Link></li><li><Link href="/compare">Compare</Link></li><li><Link href="/calculator">Landed-cost calculator</Link></li><li><Link href="/request-a-car">Request a car</Link></li><li><Link href="/track">Track my car</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold">Learn</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            <li><Link href="/how-it-works">How it works</Link></li><li><Link href="/payment-protection">Payment protection</Link></li><li><Link href="/shipping">Shipping & delivery</Link></li><li><Link href="/dealers">Dealer directory</Link></li><li><Link href="/dealers/apply">Become a dealer</Link></li><li><Link href="/help">Help centre</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold">Company</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            <li><Link href="/about">About & contact</Link></li><li><Link href="/legal/terms">Terms</Link></li><li><Link href="/legal/privacy">Privacy policy</Link></li><li><Link href="/legal/refunds-disputes">Cancellation, refund & disputes</Link></li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">{brand.supportEmail} · {brand.supportPhone}</p>
        </div>
      </div>
    </footer>
  );
}
