import Link from "next/link";
import { ArrowRight, BadgeCheck, Calculator, FileSearch, Lock, Search, Ship, Truck, Wallet, Scale, Landmark, PackageCheck } from "lucide-react";
import { prisma } from "@/server/db";
import { brand } from "@/config/brand";
import { VehicleCard } from "@/components/VehicleCard";
import { EmptyState } from "@/components/ui";
import { makeStats } from "@/server/inventory/service";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: Search, title: "Choose a vehicle", body: "Browse vehicles overseas, already shipped, or in Lagos. Each listing separates verified facts from seller declarations." },
  { icon: Calculator, title: "See the full cost to Lagos", body: "Get an itemised quote: vehicle, freight, estimated duties & VAT, clearing, delivery and our fee — with what is fixed and what may vary." },
  { icon: FileSearch, title: "Accept clear terms", body: "Your order records the agreed scope, settlement schedule, inspection period and cancellation rules before you pay." },
  { icon: Lock, title: "Pay into protected funds", body: "Pay with a unique reference. Payment is confirmed only from verified provider or bank records — never from a screenshot." },
  { icon: Ship, title: "Track every milestone", body: "Purchase, inspection, export, vessel departure, arrival, customs and delivery — each recorded with evidence and timestamps." },
  { icon: PackageCheck, title: "Inspect, then accept", body: "After delivery you have a contractual inspection period. Final funds are released only after acceptance or the period ends without a dispute." },
];

const FAQ = [
  { q: "Is the total price guaranteed?", a: "Only when we issue a fixed-price quote, which we do when every included cost can genuinely be fixed. Most imports carry variable government charges, freight and currency movements, so we issue an estimated landed-cost quote with a likely range and label each charge as fixed, quoted, estimated or variable. Any additional charge needs your approval unless it falls under a contractual clause disclosed before you paid." },
  { q: "How long does delivery to Lagos take?", a: "It depends on where the car is. A vehicle already in Lagos can be delivered within days; vehicles still overseas typically take several weeks to a few months depending on the origin, sailing schedules, port congestion and customs examination. We show an evidence-based range on every listing and update the estimate — with the reason — when new information arrives. We never promise a fixed number of days." },
  { q: "Who holds my money?", a: "Funds are recorded against a protected-funds arrangement with an authorised partner and released in stages only after verified milestones and approval by two separate finance staff. In this demonstration environment payments are simulated; no live escrow partner is connected yet." },
  { q: "What if the car isn't as described?", a: "Raise a dispute with evidence during the inspection period (or at any milestone for issues like the wrong VIN or a vehicle that was never purchased). Eligible funds that have not yet been released are frozen while we investigate, and decisions are documented. Costs already irreversibly incurred — such as duties paid — may not be refundable unless they can be recovered." },
  { q: "Are you a customs agent or shipping company?", a: `No. ${brand.name} coordinates the process and works with licensed clearing agents, carriers and transporters. We will always tell you which partner is responsible for each step.` },
  { q: "Can you find a specific car for me?", a: "Yes. Submit a sourcing request with your make, model, budget and preferences. Verified dealers or our team send offers with a sourcing quote; you only pay once you accept an offer and its terms." },
];

export default async function Home() {
  const [featured, stats, dealers, makes] = await Promise.all([
    prisma.vehicleListing.findMany({ where: { status: "PUBLISHED", availability: { notIn: ["SOLD"] } }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 6, include: { spec: true, media: { orderBy: { sortOrder: "asc" }, take: 1 }, dealerOrg: true, facts: true } }),
    prisma.vehicleListing.count({ where: { status: "PUBLISHED" } }),
    prisma.dealerOrganization.count({ where: { status: "APPROVED" } }),
    makeStats(),
  ]);
  return (
    <>
      <section className="relative overflow-hidden bg-brand text-white">
        <div className="absolute inset-0 opacity-20" aria-hidden style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #3b82f6 0, transparent 40%), radial-gradient(circle at 80% 60%, #10b981 0, transparent 35%)" }} />
        <div className="container-page relative grid gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium"><BadgeCheck className="h-4 w-4" aria-hidden /> Overseas to {brand.primaryCity}, end to end</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Your car, from overseas to Lagos.</h1>
            <p className="mt-4 max-w-xl text-lg text-blue-100">Transparent pricing. Protected payments. Tracked delivery. Buy foreign-used vehicles with an itemised landed cost, milestone-based payment release and evidence at every step.</p>
            <form action="/vehicles" className="mt-8 flex max-w-xl flex-col gap-2 rounded-xl bg-white p-2 shadow-lg sm:flex-row" role="search">
              <label className="sr-only" htmlFor="hero-q">Search vehicles</label>
              <input id="hero-q" name="q" placeholder="Search make or model, e.g. Toyota Camry" className="flex-1 rounded-lg px-3 py-2.5 text-slate-900 outline-none" />
              <select name="availability" aria-label="Availability" className="rounded-lg border border-slate-200 px-2 py-2.5 text-sm text-slate-700">
                <option value="">Any location</option>
                <option value="AVAILABLE_LOCAL_DELIVERY">In Lagos now</option>
                <option value="SHIPPED_IN_TRANSIT">Already shipped</option>
                <option value="PURCHASED_AWAITING_SHIPMENT">Purchased, awaiting ship</option>
                <option value="AVAILABLE_FOR_PURCHASE">Available overseas</option>
              </select>
              <button className="btn-primary">Search <ArrowRight className="h-4 w-4" aria-hidden /></button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-blue-100">
              {makes.slice(0, 6).map((m) => <Link key={m.make} href={`/vehicles?make=${encodeURIComponent(m.make)}`} className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">{m.make} ({m.count})</Link>)}
            </div>
          </div>
          <div className="grid content-center gap-3 sm:grid-cols-2">
            {[
              { icon: Calculator, t: "Itemised landed cost", d: "Every charge shows who receives it and whether it is fixed, quoted, estimated or variable." },
              { icon: Wallet, t: "Milestone-based release", d: "Funds release in stages after verified purchase, shipping and your acceptance." },
              { icon: Ship, t: "Evidence-backed tracking", d: "Milestones carry documents and timestamps. Revised ETAs always state why." },
              { icon: Scale, t: "Controlled disputes", d: "Open a dispute and eligible unreleased funds are frozen while we investigate." },
            ].map((f) => (
              <div key={f.t} className="rounded-xl bg-white/10 p-4 ring-1 ring-white/15">
                <f.icon className="h-5 w-5 text-emerald-300" aria-hidden />
                <p className="mt-2 font-semibold">{f.t}</p>
                <p className="mt-1 text-sm text-blue-100">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Featured vehicles</h2>
            <p className="muted">{stats} vehicles listed · {dealers} verified dealers</p>
          </div>
          <Link href="/vehicles" className="btn-secondary">View all</Link>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.length ? featured.map((l) => <VehicleCard key={l.id} l={l} />) : <EmptyState title="No vehicles listed yet">New listings appear here once approved by our moderation team.</EmptyState>}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-14" aria-labelledby="process">
        <div className="container-page">
          <h2 id="process" className="text-2xl font-bold">How buying works</h2>
          <p className="muted mt-1 max-w-2xl">The whole journey, from choosing a car overseas to driving it in Lagos, without needing to call sales.</p>
          <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card card-pad">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-light font-bold text-brand">{i + 1}</span>
                  <s.icon className="h-5 w-5 text-brand" aria-hidden />
                </div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6"><Link href="/how-it-works" className="link">Read the detailed process →</Link></div>
        </div>
      </section>

      <section className="container-page grid gap-8 py-14 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold">How your payment is protected</h2>
          <p className="mt-2 text-slate-600">Your money is not paid to the seller up front. It is recorded against a protected-funds arrangement and released in stages, only when verifiable evidence shows the agreed milestone has happened.</p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              ["Verified receipt", "Payment is confirmed only from a signed provider event or a bank statement checked by two finance staff."],
              ["Staged release", "Example schedule: part of the vehicle price after verified purchase and inspection, freight after departure, duties after arrival, the remainder after your acceptance."],
              ["Dual control", "No single person — and never a dealer — can release funds. Every release needs two different authorised approvers."],
              ["Dispute hold", "Opening a dispute freezes eligible unreleased funds until a documented decision is made."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-verified" aria-hidden /><span><span className="font-semibold">{t}.</span> {d}</span></li>
            ))}
          </ul>
          <Link href="/payment-protection" className="btn-secondary mt-6">Payment protection explained</Link>
        </div>
        <div>
          <h2 className="text-2xl font-bold">From the port to your driveway</h2>
          <ol className="mt-6 space-y-3">
            {[
              ["Purchase & inspection", "Invoice and inspection report uploaded and reviewed."],
              ["Export & booking", "Collection to port, export documents, vessel booking."],
              ["Ocean transit", "Bill of lading on file. ETA revised only with evidence."],
              ["Arrival in Lagos", "Arrival notice, then customs assessment and clearance by a licensed agent."],
              ["Release & delivery", "Port release evidence, transport within Lagos and a signed handover."],
              ["Inspection period", "You inspect and accept, or report a documented discrepancy."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                {i < 2 ? <FileSearch className="h-5 w-5 text-brand" aria-hidden /> : i < 4 ? <Ship className="h-5 w-5 text-brand" aria-hidden /> : <Truck className="h-5 w-5 text-brand" aria-hidden />}
                <div><p className="font-semibold">{t}</p><p className="text-sm text-slate-600">{d}</p></div>
              </li>
            ))}
          </ol>
          <Link href="/shipping" className="btn-secondary mt-6">Shipping & delivery details</Link>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white py-14">
        <div className="container-page max-w-3xl">
          <h2 className="text-2xl font-bold">Frequently asked questions</h2>
          <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}<span className="float-right text-slate-400 group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm leading-6 text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">More answers in the <Link href="/help" className="link">help centre</Link>.</p>
        </div>
      </section>
    </>
  );
}
