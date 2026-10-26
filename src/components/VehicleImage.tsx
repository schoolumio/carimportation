// Renders uploaded photos, or a clearly-labelled vector illustration when no real photo exists (demo data).
import { cx } from "./ui";

const BODY: Record<string, string> = {
  sedan: "M40 118 L70 92 Q92 70 130 66 L230 64 Q262 66 288 90 L320 108 Q352 110 362 122 L364 140 L36 140 Z",
  suv: "M36 112 L56 76 Q66 60 96 58 L262 56 Q286 58 300 78 L326 104 Q356 108 364 122 L366 142 L34 142 Z",
  minivan: "M34 110 L60 64 Q70 50 104 48 L300 48 Q322 50 332 70 L350 104 Q364 110 366 124 L366 142 L34 142 Z",
  hatchback: "M40 116 L74 86 Q96 66 140 64 L262 64 Q286 68 300 96 L330 110 Q356 114 362 126 L362 140 L38 140 Z",
  pickup: "M34 112 L60 80 Q70 66 100 64 L200 64 L210 96 L352 98 Q366 102 366 120 L366 142 L34 142 Z",
  coupe: "M44 120 L90 92 Q120 72 170 70 L232 70 Q270 74 300 100 L330 112 Q358 116 362 128 L362 140 L42 140 Z",
};

export function VehicleImage({ url, alt, className, showLabel = true }: { url?: string | null; alt: string; className?: string; showLabel?: boolean }) {
  if (url && !url.startsWith("illustration:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={cx("h-full w-full object-cover", className)} loading="lazy" />;
  }
  const [, bodyRaw = "sedan", color = "#1e3a5f", view] = (url ?? "illustration:sedan:#1e3a5f").split(":");
  const body = BODY[bodyRaw] ? bodyRaw : bodyRaw === "minivan" ? "minivan" : "sedan";
  const flip = view === "rear";
  return (
    <div className={cx("relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200", className)} role="img" aria-label={`${alt} (illustration)`}>
      <svg viewBox="0 0 400 180" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id={`g-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.95" />
            <stop offset="1" stopColor={color} stopOpacity="0.75" />
          </linearGradient>
        </defs>
        <ellipse cx="200" cy="152" rx="170" ry="9" fill="#0f172a" opacity="0.12" />
        <g transform={flip ? "translate(400,0) scale(-1,1)" : undefined}>
          <path d={BODY[body]} fill={`url(#g-${color.slice(1)})`} stroke="#0f172a" strokeOpacity="0.25" strokeWidth="2" />
          <path d={body === "suv" || body === "minivan" ? "M80 78 Q90 66 110 66 L250 66 Q270 68 282 86 L292 100 L78 100 Z" : "M92 96 Q110 78 140 76 L226 76 Q252 78 270 98 Z"} fill="#e2e8f0" opacity="0.85" />
          <circle cx="104" cy="140" r="22" fill="#1f2937" /><circle cx="104" cy="140" r="10" fill="#9ca3af" />
          <circle cx="296" cy="140" r="22" fill="#1f2937" /><circle cx="296" cy="140" r="10" fill="#9ca3af" />
          <rect x="344" y="114" width="16" height="6" rx="2" fill="#fde68a" />
        </g>
      </svg>
      {showLabel && <span className="absolute bottom-2 left-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">Illustration · no photo</span>}
    </div>
  );
}
