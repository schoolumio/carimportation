"use client";
// Timestamps are stored in UTC and rendered in the viewer's local timezone.
export function LocalTime({ iso, mode = "datetime" }: { iso: string | Date | null | undefined; mode?: "datetime" | "date" }) {
  if (!iso) return <span>—</span>;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const text = d.toLocaleString(undefined, mode === "date" ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" });
  return (
    <time dateTime={d.toISOString()} title={d.toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
