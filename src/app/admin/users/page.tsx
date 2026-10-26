import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePerm } from "@/server/web/session";
import { ROLES, type RoleKey } from "@/server/auth/permissions";
import { Badge, Card, Flash, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { createStaffAction, roleAction, userStatusAction } from "../actions";

export const metadata = { title: "Users & roles" };

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requirePerm("user.manage");
  const users = await prisma.user.findMany({ where: sp.q ? { OR: [{ email: { contains: sp.q, mode: "insensitive" } }, { fullName: { contains: sp.q, mode: "insensitive" } }] } : {}, include: { roles: { include: { role: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const roleKeys = Object.keys(ROLES) as RoleKey[];
  return (
    <div className="space-y-6">
      <PageHeader title="Users & roles" actions={<Link className="btn-secondary" href="/admin/users/roles">Role permissions</Link>} />
      <Flash sp={sp} />
      <form className="flex gap-2"><input name="q" defaultValue={sp.q} className="input w-72" placeholder="Search email or name" /><button className="btn-secondary">Search</button></form>
      <div className="card overflow-x-auto"><table className="table">
        <thead><tr><th>User</th><th>Roles</th><th>Status</th><th>MFA</th><th>Last sign-in</th><th>Manage</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{users.map((u) => (
          <tr key={u.id}>
            <td>{u.fullName}<br /><span className="text-xs text-slate-500">{u.email}</span> {u.isDemo && <Badge tone="pending">demo</Badge>}</td>
            <td><div className="flex flex-wrap gap-1">{u.roles.map((r) => <form key={r.roleId} action={roleAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="role" value={r.role.key} /><input type="hidden" name="op" value="revoke" /><button title="Revoke" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs hover:bg-red-100">{r.role.key.toLowerCase()} ×</button></form>)}</div></td>
            <td><Badge tone={u.status === "ACTIVE" ? "verified" : "danger"}>{u.status.toLowerCase()}</Badge></td>
            <td>{u.mfaEnabled ? "on" : "off"}</td>
            <td>{u.lastLoginAt ? <LocalTime iso={u.lastLoginAt} /> : "—"}</td>
            <td className="space-y-1">
              <form action={roleAction} className="flex gap-1"><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="op" value="grant" /><select name="role" className="input py-1 text-xs">{roleKeys.map((k) => <option key={k} value={k}>{ROLES[k].name}</option>)}</select><button className="btn-secondary btn-sm">Grant</button></form>
              <form action={userStatusAction} className="flex gap-1"><input type="hidden" name="userId" value={u.id} /><select name="status" className="input py-1 text-xs"><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="LOCKED">Locked</option></select><button className="btn-ghost btn-sm">Set</button></form>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      <Card title="Create staff or partner account">
        <form action={createStaffAction} className="grid gap-2 sm:grid-cols-5">
          <input name="fullName" className="input" placeholder="Full name" required /><input name="email" type="email" className="input" placeholder="Email" required /><input name="password" type="password" className="input" placeholder="Temporary password" required minLength={10} />
          <select name="role" className="input">{roleKeys.filter((k) => k !== "BUYER").map((k) => <option key={k} value={k}>{ROLES[k].name}</option>)}</select>
          <button className="btn-primary btn-sm">Create</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Role changes revoke the user&apos;s active sessions. You cannot change your own roles. Privileged users should enable MFA on first sign-in.</p>
      </Card>
    </div>
  );
}
