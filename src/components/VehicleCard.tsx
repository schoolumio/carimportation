import Link from "next/link";
import type { DealerOrganization, VehicleFactVerification, VehicleListing, VehicleMedia, VehicleSpecification } from "@prisma/client";
import { MapPin, ShieldCheck } from "lucide-react";
import { VehicleImage } from "./VehicleImage";
import { Badge, DemoTag } from "./ui";
import { formatMoney } from "@/lib/money";
import { AVAILABILITY_LABEL } from "@/server/inventory/service";
import { COUNTRY_NAME } from "@/lib/labels";

export type CardListing = VehicleListing & { spec: VehicleSpecification | null; media: VehicleMedia[]; dealerOrg: DealerOrganization | null; facts?: VehicleFactVerification[] };

export function availabilityTone(a: string) {
  if (a === "AVAILABLE_LOCAL_DELIVERY") return "verified" as const;
  if (a === "RESERVED") return "pending" as const;
  if (a === "SOLD") return "neutral" as const;
  return "brand" as const;
}

export function VehicleCard({ l }: { l: CardListing }) {
  const verifiedFacts = (l.facts ?? []).filter((f) => f.provenance === "PLATFORM_VERIFIED" || f.provenance === "INDEPENDENT_REPORT").length;
  return (
    <article className="card group flex flex-col overflow-hidden transition hover:shadow-md">
      <Link href={`/vehicles/${l.slug}`} className="relative block aspect-[16/10]">
        <VehicleImage url={l.media[0]?.url} alt={l.title} />
        <div className="absolute left-2 top-2 flex gap-1">
          {l.featured && <Badge tone="brand">Featured</Badge>}
          {l.isDemo && <DemoTag />}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight"><Link href={`/vehicles/${l.slug}`} className="hover:underline">{l.title}</Link></h3>
        </div>
        <p className="text-xs text-slate-500">
          {l.mileage.toLocaleString()} {l.mileageUnit} · {l.spec?.transmission} · {l.spec?.fuelType}
        </p>
        <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" aria-hidden /> {l.currentLocation} · from {COUNTRY_NAME[l.sourceCountry] ?? l.sourceCountry}</p>
        <div className="flex flex-wrap gap-1">
          <Badge tone={availabilityTone(l.availability)}>{AVAILABILITY_LABEL[l.availability]}</Badge>
          {verifiedFacts > 0 && <Badge tone="verified"><ShieldCheck className="h-3 w-3" aria-hidden /> {verifiedFacts} verified fact{verifiedFacts > 1 ? "s" : ""}</Badge>}
        </div>
        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <p className="text-xs text-slate-500">Vehicle price</p>
            <p className="text-lg font-bold tabular-nums">{formatMoney(l.price, l.priceCurrency, { compact: true })}</p>
          </div>
          <Link href={`/vehicles/${l.slug}#landed-cost`} className="text-xs font-semibold text-brand hover:underline">See cost to Lagos →</Link>
        </div>
        <p className="text-xs text-slate-500">{l.dealerOrg ? `Listed by ${l.dealerOrg.tradingName}` : "Platform inventory"}</p>
      </div>
    </article>
  );
}

export function VehicleCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[16/10] rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-6 w-1/3" />
      </div>
    </div>
  );
}
