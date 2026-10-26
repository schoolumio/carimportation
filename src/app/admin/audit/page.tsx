import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { verifyAuditChain } from "@/server/audit/audit";
import { Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Audit log" };

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("audit.view");
  const where = { ...(sp.entity ? { entityId: sp.entity } : {}), ...(sp.action ? { action: { startsWith: sp.action } } : {}) };
  const [rows, chain] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { seq: "desc" }, take: 200 }), sp.verify ? verifyAuditChain(prisma) : Promise.resolve(null)]);
  return (
    <div className="space-y-4">
      <PageHeader title="Immutable audit log" subtitle="Append-only (enforced by the database) and hash-chained for tamper evidence." />
      {chain && <Notice tone={chain.ok ? "success" : "danger"}>{chain.ok ? `Chain verified: ${chain.checked} events, no tampering detected.` : `Chain broken at event ${chain.brokenAt}.`}</Notice>}
      <form className="flex flex-wrap gap-2"><input name="action" defaultValue={sp.action} className="input w-48" placeholder="Action prefix e.g. settlement" /><input name="entity" defaultValue={sp.entity} className="input w-64" placeholder="Entity id" /><button className="btn-secondary">Filter</button><button name="verify" value="1" className="btn-secondary">Verify hash chain</button></form>
      <div className="card overflow-x-auto"><table className="table text-xs">
        <thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th><th>Hash</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((r) => <tr key={r.id}><td>{r.seq.toString()}</td><td><LocalTime iso={r.createdAt} /></td><td>{r.actorRoles.join(",")}<br /><span className="text-slate-400">{r.actorId?.slice(0, 10)}</span></td><td>{r.action}</td><td>{r.entityType}<br /><span className="text-slate-400">{r.entityId.slice(0, 12)}</span></td><td className="max-w-md">{r.summary}</td><td className="font-mono text-slate-400">{r.hash.slice(0, 10)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
