import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container-page max-w-lg py-20 text-center">
      <h1 className="h1">Page not found</h1>
      <p className="muted mt-2">The page or record does not exist, or you do not have access to it.</p>
      <Link href="/vehicles" className="btn-primary mt-6">Browse vehicles</Link>
    </div>
  );
}
