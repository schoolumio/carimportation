import { prisma } from "@/server/db";
import { getSession, requireActor } from "@/server/web/session";
import { Badge, Card, Field, Flash, Notice, PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { otpauthUrl } from "@/server/auth/totp";
import { brand } from "@/config/brand";
import { ID_TYPES } from "@/server/compliance/service";
import { beginMfaAction, changePasswordAction, confirmMfaAction, identityAction, revokeSessionAction, updateProfileAction } from "../actions";

export const metadata = { title: "Profile & security" };

export default async function Profile({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const s = await getSession();
  const [user, profile, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: actor.userId } }),
    prisma.buyerProfile.findUnique({ where: { userId: actor.userId } }),
    prisma.session.findMany({ where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  const privileged = actor.roles.some((r) => ["SUPER_ADMIN", "FINANCE", "OPERATIONS", "VERIFICATION", "SUPPORT"].includes(r));
  return (
    <div className="space-y-6">
      <PageHeader title="Profile & security" />
      <Flash sp={sp} />
      <Card title="Profile">
        <form action={updateProfileAction} className="grid gap-3 sm:grid-cols-3">
          <Field label="Full name" name="fullName" defaultValue={user.fullName} required />
          <Field label="Phone" name="phone" defaultValue={user.phone ?? ""} />
          <Field label="Email (contact support to change)" name="email" defaultValue={user.email} disabled />
          <div><button className="btn-primary btn-sm">Save</button></div>
        </form>
      </Card>
      <div id="identity">
        <Card title={<span>Identity verification {profile?.identityStatus && <Badge tone={profile.identityStatus === "VERIFIED" ? "verified" : profile.identityStatus === "REJECTED" ? "danger" : "pending"}>{profile.identityStatus.replace("_", " ").toLowerCase()}</Badge>}</span>}>
          {profile?.identityStatus === "VERIFIED" ? <p className="text-sm text-slate-600">Your identity is verified ({profile.identityType?.replace(/_/g, " ").toLowerCase()}).</p> : profile?.identityStatus === "PENDING" ? <Notice>Your documents are being reviewed by our verification team.</Notice> : (
            <form action={identityAction} className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="label">Document type</span><select name="identityType" className="input">{ID_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></label>
              <Field label="Document number" name="identityNumber" required hint="Encrypted at rest; visible only to verification staff." />
              <Field label="Address" name="addressLine" required defaultValue={profile?.addressLine ?? ""} />
              <Field label="City" name="city" required defaultValue={profile?.city ?? "Lagos"} />
              <Field label="State" name="state" required defaultValue={profile?.state ?? "Lagos"} />
              <label className="block"><span className="label">Document image or PDF</span><input type="file" name="file" required accept="application/pdf,image/*" className="text-sm" /></label>
              <div><button className="btn-primary btn-sm">Submit for verification</button></div>
            </form>
          )}
        </Card>
      </div>
      <Card title="Two-factor authentication">
        {user.mfaEnabled ? <p className="text-sm text-verified">Enabled. You&apos;ll be asked for a code at each sign-in.</p> : sp.mfaSecret ? (
          <form action={confirmMfaAction} className="space-y-3 text-sm">
            <p>Add this key to your authenticator app (Google Authenticator, Authy, 1Password…):</p>
            <code className="block break-all rounded bg-slate-100 p-2">{sp.mfaSecret}</code>
            <p className="text-xs text-slate-500 break-all">{otpauthUrl(sp.mfaSecret, user.email, brand.name)}</p>
            <Field label="6-digit code" name="code" inputMode="numeric" required />
            <button className="btn-primary btn-sm">Confirm and enable</button>
          </form>
        ) : (
          <form action={beginMfaAction} className="space-y-2">
            {privileged && <Notice tone="warning">Your account has privileged access. Two-factor authentication is strongly recommended and should be enforced by policy.</Notice>}
            <button className="btn-secondary btn-sm">Set up two-factor authentication</button>
          </form>
        )}
      </Card>
      <Card title="Change password">
        <form action={changePasswordAction} className="grid gap-3 sm:grid-cols-3">
          <Field label="Current password" name="current" type="password" required autoComplete="current-password" />
          <Field label="New password" name="next" type="password" minLength={10} required autoComplete="new-password" />
          <Field label="Confirm new password" name="confirm" type="password" minLength={10} required autoComplete="new-password" />
          <div><button className="btn-primary btn-sm">Change password</button></div>
        </form>
      </Card>
      <Card title="Active sessions">
        <ul className="divide-y divide-slate-100 text-sm">{sessions.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0"><span className="block truncate">{x.userAgent ?? "Unknown device"}</span><span className="text-xs text-slate-500">{x.ip ?? "?"} · last seen <LocalTime iso={x.lastSeenAt} /></span></span>
            {s?.session.id === x.id ? <Badge tone="verified">This device</Badge> : <form action={revokeSessionAction}><input type="hidden" name="sessionId" value={x.id} /><button className="btn-ghost btn-sm">Sign out</button></form>}
          </li>
        ))}</ul>
      </Card>
    </div>
  );
}
