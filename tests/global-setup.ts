import { execSync } from "node:child_process";

// Applies pending migrations (non-destructive) to the dedicated test database once per run.
// Individual tests reset state by truncating tables in that test database (see tests/helpers.ts).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://autovault:autovault@localhost:5432/autovault_test";
  if (!/_test(\?|$)/.test(url)) throw new Error("Refusing to run tests against a database whose name does not end in _test");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
