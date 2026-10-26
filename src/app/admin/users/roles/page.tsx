import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { PERMISSIONS, PROTECTED_PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { Flash, PageHeader } from "@/components/ui";
import { rolePermAction } from "../../actions";

export const metadata = { title: "Role permissions" };

export default async function Roles({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("user.manage");
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { key: "asc" } });
  return (
    <div>
      <PageHeader title="Role permissions" subtitle="Protected financial and administrative permissions cannot be granted to non-privileged roles. Super administrator permissions are fixed." crumbs={[{ href: "/admin/users", label: "Users" }]} />
      <Flash sp={sp} />
      <div className="card overflow-x-auto"><table className="table text-xs">
        <thead><tr><th>Permission</th>{roles.map((r) => <th key={r.id}>{r.key.replace(/_/g, " ").toLowerCase()}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
          <tr key={p}><td title={PERMISSIONS[p]}>{p}{PROTECTED_PERMISSIONS.includes(p) && " 🔒"}</td>{roles.map((r) => {
            const has = r.permissions.some((x) => x.permission.key === p);
            return <td key={r.id} className="text-center">{r.key === "SUPER_ADMIN" ? "✓" : <form action={rolePermAction}><input type="hidden" name="role" value={r.key} /><input type="hidden" name="permission" value={p} /><input type="hidden" name="granted" value={has ? "0" : "1"} /><button className={`h-5 w-5 rounded ${has ? "bg-verified text-white" : "bg-slate-100"}`} disabled={!has && PROTECTED_PERMISSIONS.includes(p) && !r.privileged}>{has ? "✓" : ""}</button></form>}</td>;
          })}</tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
