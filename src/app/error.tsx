"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page max-w-lg py-20 text-center">
      <h1 className="h1">Something went wrong</h1>
      <p className="muted mt-2">The error has been logged. Please try again; if it persists, contact support.</p>
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
