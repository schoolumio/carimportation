import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { CONFIG_DEFAULTS } from "@/server/admin/config";
import { DEFAULT_TEMPLATES } from "@/server/notifications/templates";
import { Card, Flash, PageHeader } from "@/components/ui";
import { configAction, countryAction, locationAction, templateAction } from "../actions";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("config.manage");
  const [rows, countries, locations, templates] = await Promise.all([prisma.systemConfig.findMany(), prisma.sourceCountry.findMany({ orderBy: { name: "asc" } }), prisma.deliveryLocation.findMany(), prisma.notificationTemplate.findMany()]);
  const values = new Map(rows.map((r) => [r.key, r.value]));
  return (
    <div className="space-y-6">
      <PageHeader title="Platform settings" subtitle="All changes are audited." />
      <Flash sp={sp} />
      <Card title="Configuration (JSON values)">
        <ul className="space-y-2">{Object.entries(CONFIG_DEFAULTS).map(([k, def]) => (
          <li key={k}><form action={configAction} className="grid gap-2 sm:grid-cols-[260px_1fr_auto] sm:items-center"><input type="hidden" name="key" value={k} /><code className="text-xs">{k}{values.has(k) ? "" : " (default)"}</code><input name="value" className="input font-mono text-xs" defaultValue={JSON.stringify(values.get(k) ?? def)} /><button className="btn-secondary btn-sm">Save</button></form></li>
        ))}</ul>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Source countries">
          <ul className="mb-3 text-sm">{countries.map((c) => <li key={c.code}>{c.code} {c.name} · {c.originPorts.join(", ")} · {c.transitDaysMin}–{c.transitDaysMax} days {c.active ? "" : "(inactive)"}</li>)}</ul>
          <form action={countryAction} className="grid gap-2 sm:grid-cols-3"><input name="code" className="input" placeholder="Code" maxLength={2} required /><input name="name" className="input" placeholder="Name" required /><input name="originPorts" className="input" placeholder="Ports, comma separated" /><input name="min" type="number" className="input" placeholder="Transit min days" required /><input name="max" type="number" className="input" placeholder="Transit max days" required /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked /> Active</label><button className="btn-secondary btn-sm w-fit">Save</button></form>
        </Card>
        <Card title="Delivery locations">
          <ul className="mb-3 text-sm">{locations.map((l) => <li key={l.code}>{l.code} · {l.name} · {l.state} {l.active ? "" : "(inactive)"}</li>)}</ul>
          <form action={locationAction} className="grid gap-2 sm:grid-cols-3"><input name="code" className="input" placeholder="Code" required /><input name="name" className="input" placeholder="Name" required /><input name="state" className="input" placeholder="State" defaultValue="Lagos" required /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked /> Active</label><button className="btn-secondary btn-sm w-fit">Save</button></form>
        </Card>
      </div>
      <Card title="Notification templates">
        <p className="mb-2 text-xs text-slate-500">Override defaults per channel. Placeholders use {"{{name}}"}. WhatsApp templates must also be approved by Meta before use.</p>
        <ul className="space-y-3">{Object.entries(DEFAULT_TEMPLATES).map(([key, d]) => {
          const t = templates.find((x) => x.key === key && x.channel === "EMAIL");
          return (
            <li key={key}><form action={templateAction} className="grid gap-2 sm:grid-cols-[180px_100px_1fr_2fr_auto_auto] sm:items-center"><input type="hidden" name="key" value={key} /><code className="text-xs">{key}</code><select name="channel" className="input text-xs" defaultValue="EMAIL"><option>EMAIL</option><option>IN_APP</option><option>SMS</option><option>WHATSAPP</option></select><input name="subject" className="input text-xs" defaultValue={t?.subject ?? d.subject} /><input name="body" className="input text-xs" defaultValue={t?.body ?? d.body} /><label className="text-xs"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} /> on</label><button className="btn-secondary btn-sm">Save</button></form></li>
          );
        })}</ul>
      </Card>
    </div>
  );
}
