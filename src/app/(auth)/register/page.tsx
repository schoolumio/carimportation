import Link from "next/link";
import { Field, Flash } from "@/components/ui";
import { registerAction } from "../actions";

export const metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="h1">Create your buyer account</h1>
      <p className="muted mt-1">Dealers: <Link href="/dealers/apply" className="link">apply here</Link> instead.</p>
      <div className="mt-6"><Flash sp={sp} /></div>
      <form action={registerAction} className="card card-pad space-y-4">
        <Field label="Full name" name="fullName" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" placeholder="+234…" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters with letters and numbers." />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" className="mt-1" required />
          <span>I agree to the <Link href="/legal/terms" className="link">terms</Link> and <Link href="/legal/privacy" className="link">privacy policy</Link>.</span>
        </label>
        <button className="btn-primary w-full">Create account</button>
      </form>
    </div>
  );
}
