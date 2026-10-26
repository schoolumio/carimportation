import Link from "next/link";
export const metadata = { title: "Not permitted" };
export default function Forbidden() {
  return (
    <div className="container-page max-w-lg py-20 text-center">
      <h1 className="h1">You don&apos;t have access to this page</h1>
      <p className="muted mt-2">Your account does not hold the role required. If you believe this is a mistake, contact your administrator.</p>
      <Link href="/" className="btn-primary mt-6">Back to home</Link>
    </div>
  );
}
