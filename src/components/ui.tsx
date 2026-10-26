import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: string; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {crumbs && (
          <nav className="mb-1 text-xs text-slate-500" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                <Link className="hover:underline" href={c.href}>{c.label}</Link>
                {i < crumbs.length - 1 && " / "}
              </span>
            ))}
          </nav>
        )}
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "verified" | "pending" | "danger" | "brand" | "info";
const toneCls: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  verified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  brand: "bg-brand-light text-brand ring-blue-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
};

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", toneCls[tone])}>{children}</span>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children: ReactNode }) {
  const map = {
    info: { cls: "border-sky-200 bg-sky-50 text-sky-900", Icon: Info },
    warning: { cls: "border-amber-200 bg-amber-50 text-amber-900", Icon: AlertTriangle },
    danger: { cls: "border-red-200 bg-red-50 text-red-900", Icon: XCircle },
    success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: CheckCircle2 },
  }[tone];
  return (
    <div className={cx("flex gap-3 rounded-lg border p-3 text-sm", map.cls)} role={tone === "danger" ? "alert" : "status"}>
      <map.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}

/** Displays ?ok= / ?error= messages set by server actions. */
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.error === "string" ? sp.error : null;
  if (!ok && !err) return null;
  return <div className="mb-4">{err ? <Notice tone="danger" title="That didn't work">{err}</Notice> : <Notice tone="success">{ok}</Notice>}</div>;
}

export function Card({ title, children, actions, className, pad = true }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          {title && <h2 className="h2 text-base">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={pad ? "card-pad" : ""}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "pending" | "verified" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx("mt-1 text-2xl font-bold", tone === "danger" && "text-danger", tone === "pending" && "text-pending", tone === "verified" && "text-verified")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Field({ label, name, hint, ...rest }: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}{rest.required && <span className="text-danger"> *</span>}</span>
      <input name={name} className="input" {...rest} />
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, name, hint, ...rest }: { label: string; name: string; hint?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="label">{label}{rest.required && <span className="text-danger"> *</span>}</span>
      <textarea name={name} className="input min-h-[90px]" {...rest} />
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function Select({ label, name, options, hint, ...rest }: { label: string; name: string; options: { value: string; label: string }[]; hint?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="label">{label}{rest.required && <span className="text-danger"> *</span>}</span>
      <select name={name} className="input" {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-right font-medium text-slate-800">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-5 overflow-x-auto sm:mx-0">{children}</div>;
}

export function DemoTag() {
  return <Badge tone="pending" title="Demonstration / test data">DEMO</Badge>;
}
