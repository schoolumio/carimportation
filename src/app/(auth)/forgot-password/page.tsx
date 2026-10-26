import Link from "next/link";
import { Field, Notice } from "@/components/ui";
import { forgotAction } from "../actions";

export const metadata = { title: "Account recovery" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="h1">Reset your password</h1>
      {sp.sent ? (
        <div className="mt-6 space-y-3">
          <Notice tone="success">If an account exists for that email, we have sent a reset link valid for 30 minutes.</Notice>
          {sp.dev && <Notice tone="warning" title="Development only">Email delivery is not configured. <Link className="link" href={`/reset-password?token=${sp.dev}`}>Open the reset link</Link>.</Notice>}
        </div>
      ) : (
        <form action={forgotAction} className="card card-pad mt-6 space-y-4">
          <Field label="Email" name="email" type="email" required />
          <button className="btn-primary w-full">Send reset link</button>
          <p className="text-xs text-slate-500">For your security, resetting your password signs you out on all devices. Staff accounts with MFA must also present their authenticator code at next sign-in.</p>
        </form>
      )}
    </div>
  );
}
