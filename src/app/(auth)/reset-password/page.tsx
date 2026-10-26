import { Field, Flash } from "@/components/ui";
import { resetAction } from "../actions";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="h1">Choose a new password</h1>
      <div className="mt-6"><Flash sp={sp} /></div>
      <form action={resetAction} className="card card-pad space-y-4">
        <input type="hidden" name="token" value={sp.token ?? ""} />
        <Field label="New password" name="password" type="password" minLength={10} required autoComplete="new-password" />
        <Field label="Confirm password" name="confirm" type="password" minLength={10} required autoComplete="new-password" />
        <button className="btn-primary w-full">Update password</button>
      </form>
    </div>
  );
}
