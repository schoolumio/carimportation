import { Badge, Notice } from "./ui";
import { LocalTime } from "./LocalTime";
import { BENEFICIARY_LABEL, NATURE_LABEL, QUOTE_TYPE_LABEL, STAGE_LABEL } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { CATEGORY_GROUP, type Category } from "@/server/pricing/calculator";

export interface BreakdownLine {
  code: string; label: string; category: string; amount: string; lowAmount: string; highAmount: string; originalAmount?: string | null; originalCurrency?: string | null;
  nature: string; calculation: string; ruleVerified: boolean; payableStage: string; refundable: boolean; beneficiary: string; paid?: boolean;
}
export interface BreakdownData {
  quoteType: string; lines: BreakdownLine[]; total: string; low: string; high: string; payableNow: string; payableLater: string;
  subtotals: { vehicle: string; logistics: string; taxes: string; fees: string; contingency: string };
  assumptions: string[]; exclusions: string[]; validUntil?: string | Date | null; usesUnverifiedRules: boolean; etaMinDays?: number; etaMaxDays?: number;
}

const GROUPS: { key: string; title: string }[] = [
  { key: "vehicle", title: "Vehicle" },
  { key: "logistics", title: "Importation & logistics" },
  { key: "taxes", title: "Estimated taxes & clearing" },
  { key: "fees", title: "Platform & dealer fees" },
  { key: "contingency", title: "Contingency" },
];

export function CostBreakdown({ data, compact = false }: { data: BreakdownData; compact?: boolean }) {
  const qt = QUOTE_TYPE_LABEL[data.quoteType];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={data.quoteType === "FIXED_PRICE" ? "verified" : data.quoteType === "SOURCING" ? "info" : "pending"}>{qt?.label}</Badge>
        <span className="text-xs text-slate-500">{qt?.help}</span>
      </div>
      {data.usesUnverifiedRules && (
        <Notice tone="warning" title="Indicative rates in use">Some charges use rates not yet verified by an administrator against current official publications or contracted rates. Treat them as indicative.</Notice>
      )}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {GROUPS.map((g) => {
          const lines = data.lines.filter((l) => CATEGORY_GROUP[l.category as Category] === g.key);
          if (!lines.length) return null;
          return (
            <div key={g.key}>
              <div className="flex justify-between bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <span>{g.title}</span>
                <span>{formatMoney(data.subtotals[g.key as keyof BreakdownData["subtotals"]])}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <li key={l.code} className="px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{l.label}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone={NATURE_LABEL[l.nature]?.tone} title={NATURE_LABEL[l.nature]?.help}>{NATURE_LABEL[l.nature]?.label}</Badge>
                          {!compact && <Badge>{STAGE_LABEL[l.payableStage]}</Badge>}
                          {!compact && <Badge>{l.refundable ? "Refundable" : "Non-refundable once incurred"}</Badge>}
                          {!l.ruleVerified && <Badge tone="pending" title="Rate not yet verified against an official or contracted source">Unverified rate</Badge>}
                          {l.paid && <Badge tone="verified" title="Collected into protected funds; not yet paid to the beneficiary unless shown as released">Funded</Badge>}
                        </div>
                        {!compact && (
                          <p className="mt-1 text-xs text-slate-500">
                            Paid to: {BENEFICIARY_LABEL[l.beneficiary] ?? l.beneficiary} · {l.calculation}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">{formatMoney(l.amount)}</p>
                        {l.originalCurrency && l.originalAmount && <p className="text-xs text-slate-500">{formatMoney(l.originalAmount, l.originalCurrency)}</p>}
                        {l.lowAmount !== l.highAmount && <p className="text-[11px] text-slate-500 tabular-nums">{formatMoney(l.lowAmount, "NGN", { compact: true })} – {formatMoney(l.highAmount, "NGN", { compact: true })}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div className="space-y-1 border-t-2 border-slate-200 bg-white px-3 py-3">
          <div className="flex justify-between text-base font-bold"><span>{data.quoteType === "FIXED_PRICE" ? "Total landed cost (fixed)" : "Estimated total landed cost"}</span><span className="tabular-nums">{formatMoney(data.total)}</span></div>
          {data.quoteType !== "FIXED_PRICE" && <div className="flex justify-between text-xs text-slate-600"><span>Likely range</span><span className="tabular-nums">{formatMoney(data.low, "NGN", { compact: true })} – {formatMoney(data.high, "NGN", { compact: true })}</span></div>}
          <div className="flex justify-between text-sm text-brand"><span className="font-semibold">Amount payable now</span><span className="font-semibold tabular-nums">{formatMoney(data.payableNow)}</span></div>
          <div className="flex justify-between text-xs text-slate-600"><span>Remaining estimated costs (only if needed, with your approval)</span><span className="tabular-nums">{formatMoney(data.payableLater)}</span></div>
          {data.etaMinDays !== undefined && <div className="flex justify-between text-xs text-slate-600"><span>Estimated time to delivery in Lagos</span><span>{data.etaMinDays}–{data.etaMaxDays} days (estimate, not guaranteed)</span></div>}
          {data.validUntil && <div className="flex justify-between text-xs text-slate-600"><span>Quote valid until</span><LocalTime iso={data.validUntil} /></div>}
        </div>
      </div>
      {!compact && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Assumptions & uncertainty</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">{data.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Not included</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">{data.exclusions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
