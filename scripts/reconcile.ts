// Run a reconciliation for the last N hours (default 24): `npm run reconcile -- 48`
import { runReconciliation } from "../src/server/payments/reconciliation";
import { SYSTEM } from "../src/server/auth/actor";
import { prisma } from "../src/server/db";

async function main() {
  const hours = Number(process.argv[2] ?? 24);
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const { run, report } = await runReconciliation(SYSTEM("cli"), "SANDBOX", start, end);
  console.log(JSON.stringify({ runId: run.id, matched: report.matched.length, mismatched: report.mismatched, missingInternal: report.missingInternal, ledgerBalanced: report.ledgerBalanced, positionDifference: report.positionDifference }, null, 2));
  await prisma.$disconnect();
  if (!run.ledgerBalanced) process.exit(2);
}
main();
