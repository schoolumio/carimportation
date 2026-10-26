import type { EtaRevision, OrderPath, OrderState, OrderTransition, TrackingEvent } from "@prisma/client";
import { Check, Circle, Clock, FileCheck2 } from "lucide-react";
import { JOURNEY, STATE_LABEL } from "@/server/orders/state-machine";
import { LocalTime } from "./LocalTime";
import { Badge, cx } from "./ui";

const EXCEPTION_STATES: OrderState[] = ["CANCELLED", "REFUNDED", "PURCHASE_FAILED", "INSPECTION_FAILED"];

export function StateBadge({ state }: { state: OrderState }) {
  const tone = state === "COMPLETED" ? "verified" : EXCEPTION_STATES.includes(state) ? "danger" : ["AWAITING_PAYMENT", "COMPLIANCE_CHECK", "ACCEPTANCE_PERIOD"].includes(state) ? "pending" : "brand";
  return <Badge tone={tone}>{STATE_LABEL[state]}</Badge>;
}

/** Customer-friendly progress strip derived from verified transitions. */
export function JourneyProgress({ path, state, transitions }: { path: OrderPath; state: OrderState; transitions: OrderTransition[] }) {
  const reached = new Set(transitions.map((t) => t.toState));
  const journey = JOURNEY[path];
  const currentIdx = Math.max(...journey.map((s, i) => (reached.has(s) ? i : -1)));
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {journey.map((s, i) => {
        const done = reached.has(s) || i < currentIdx;
        const current = i === currentIdx + 1 && !EXCEPTION_STATES.includes(state) && state !== "COMPLETED";
        const t = transitions.find((x) => x.toState === s);
        return (
          <li key={s} className={cx("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", done ? "border-emerald-200 bg-emerald-50/60" : current ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
            {done ? <Check className="mt-0.5 h-4 w-4 text-verified" aria-hidden /> : current ? <Clock className="mt-0.5 h-4 w-4 text-pending" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 text-slate-300" aria-hidden />}
            <div>
              <p className={cx("font-medium", done ? "text-emerald-900" : current ? "text-amber-900" : "text-slate-500")}>{STATE_LABEL[s]}</p>
              {t && <p className="text-xs text-slate-500"><LocalTime iso={t.createdAt} /></p>}
              {current && !t && <p className="text-xs text-amber-800">Next step</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityLog({ transitions, events, etaRevisions }: { transitions: OrderTransition[]; events: TrackingEvent[]; etaRevisions: EtaRevision[] }) {
  type Item = { at: Date; kind: "transition" | "event" | "eta"; title: string; body: string; evidence?: number; source?: string };
  const items: Item[] = [
    ...transitions.map((t) => ({ at: t.createdAt, kind: "transition" as const, title: STATE_LABEL[t.toState], body: t.description, evidence: t.evidenceDocumentIds.length })),
    ...events.map((e) => ({ at: e.occurredAt, kind: "event" as const, title: e.milestone, body: `${e.description}${e.location ? ` — ${e.location}` : ""}`, evidence: e.evidenceDocumentId ? 1 : 0, source: e.source })),
    ...etaRevisions.map((r) => ({ at: r.createdAt, kind: "eta" as const, title: "Arrival estimate revised", body: `${r.newStart.toISOString().slice(0, 10)} – ${r.newEnd.toISOString().slice(0, 10)}. Reason: ${r.reason}. Based on: ${r.supportingInfo}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (!items.length) return <p className="muted">No activity recorded yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span className={cx("absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white", it.kind === "eta" ? "bg-pending" : it.kind === "event" ? "bg-sky-500" : "bg-verified")} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{it.title}</p>
            {it.kind === "event" && <Badge tone={it.source === "PROVIDER_API" ? "verified" : "neutral"}>{it.source === "PROVIDER_API" ? "Carrier feed" : it.source === "SANDBOX_SIMULATION" ? "Simulation" : "Verified manual update"}</Badge>}
            {!!it.evidence && <Badge tone="verified"><FileCheck2 className="h-3 w-3" aria-hidden /> Evidence on file</Badge>}
          </div>
          <p className="text-sm text-slate-600">{it.body}</p>
          <p className="text-xs text-slate-400"><LocalTime iso={it.at} /></p>
        </li>
      ))}
    </ol>
  );
}
