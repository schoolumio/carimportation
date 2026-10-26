import { Prisma } from "@prisma/client";

// Hand-written SQL must not rely on the connection's search_path: some hosted Postgres proxies (e.g. Neon)
// do not apply Prisma's `?schema=` setting to raw queries. Tables are therefore always schema-qualified.
export function dbSchema(): string {
  try {
    const s = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
    if (s && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) return s;
  } catch {
    /* fall through */
  }
  return "public";
}

const TABLES = new Set(["Job", "Quote", "VehicleListing", "Order", "SettlementInstruction", "Refund", "LedgerEntry"]);

/** Schema-qualified table identifier for use inside Prisma.sql / $queryRaw templates. */
export function tbl(name: string): Prisma.Sql {
  if (!TABLES.has(name)) throw new Error(`Unexpected table ${name}`);
  return Prisma.raw(`"${dbSchema()}"."${name}"`);
}
