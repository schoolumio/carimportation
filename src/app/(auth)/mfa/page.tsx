import { Field, Flash } from "@/components/ui";
import { mfaAction } from "../actions";

export const metadata = { title: "Two-factor verification" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="h1">Two-factor verification</h1>
      <p className="muted mt-1">Enter the 6-digit code from your authenticator app.</p>
      <div className="mt-6"><Flash sp={sp} /></div>
      <form action={mfaAction} className="card card-pad space-y-4">
        <input type="hidden" name="next" value={sp.next ?? "/post-login"} />
        <Field label="Code" name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required />
        <button className="btn-primary w-full">Verify</button>
      </form>
    </div>
  );
}
