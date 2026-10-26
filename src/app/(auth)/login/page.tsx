import Link from "next/link";
import { Field, Flash } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="h1">Sign in</h1>
      <p className="muted mt-1">Access your orders, quotes and tracking.</p>
      <div className="mt-6"><Flash sp={sp} /></div>
      <form action={loginAction} className="card card-pad space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <button className="btn-primary w-full">Sign in</button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="link">Forgot password?</Link>
          <Link href="/register" className="link">Create an account</Link>
        </div>
      </form>
    </div>
  );
}
