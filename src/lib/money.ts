// Decimal-safe money helpers. Never use JS floating point for financial arithmetic.
import { Prisma } from "@prisma/client";

export const D = Prisma.Decimal;
export type Dec = Prisma.Decimal;
D.set({ precision: 40, rounding: D.ROUND_HALF_UP });

export const ZERO = new D(0);

export function dec(v: Prisma.Decimal.Value | null | undefined): Dec {
  if (v === null || v === undefined) return new D(0);
  return new D(v);
}

/** Round to currency minor units (2 dp for NGN/USD/EUR/GBP/AED/CAD/JPY handled as 2 dp for simplicity of storage). */
export function round2(v: Dec): Dec {
  return v.toDecimalPlaces(2, D.ROUND_HALF_UP);
}

export function sum(values: Dec[]): Dec {
  return values.reduce((a, b) => a.plus(b), new D(0));
}

export function pct(base: Dec, percent: Prisma.Decimal.Value): Dec {
  return base.times(new D(percent)).dividedBy(100);
}

export function formatMoney(amount: Prisma.Decimal.Value, currency = "NGN", opts: { compact?: boolean } = {}): string {
  const n = new D(amount);
  const fmt = new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.compact ? 0 : 2,
    minimumFractionDigits: opts.compact ? 0 : 2,
  });
  // Intl accepts strings for exact formatting of large decimals in modern runtimes.
  return fmt.format(n.toFixed(2) as unknown as number);
}
