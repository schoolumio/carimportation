// Reconciliation: compares the provider's statement with internal provider-transaction records and checks
// that the ledger balances and that safeguarded-funds balances agree with the provider's net position.
import type { PaymentProviderKey, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { D, ZERO, dec } from "@/lib/money";
import { audit } from "@/server/audit/audit";
import type { AnyActor } from "@/server/auth/actor";
import { ACCOUNTS, accountBalance, trialBalance, unbalancedTransactions } from "@/server/ledger/ledger";
import { providerFor } from "./registry";

export interface ReconciliationReport {
  provider: PaymentProviderKey;
  periodStart: string;
  periodEnd: string;
  matched: string[];
  mismatched: { providerTxnId: string; issue: string }[];
  missingInternal: { providerTxnId: string; amount: string; reference: string }[];
  missingAtProvider: { providerTxnId: string; amount: string }[];
  ledgerBalanced: boolean;
  unbalancedTransactions: string[];
  safeguardedLedgerBalance: string;
  providerNetPosition: string;
  positionDifference: string;
}

export async function runReconciliation(actor: AnyActor, providerKey: PaymentProviderKey, periodStart: Date, periodEnd: Date) {
  const provider = providerFor(providerKey);
  const statement = await provider.statement(periodStart, periodEnd);
  const internal = await prisma.providerTransaction.findMany({ where: { provider: providerKey, occurredAt: { gte: periodStart, lte: periodEnd }, status: { not: "PENDING" } } });
  const byId = new Map(internal.map((t) => [t.providerTxnId, t]));
  const report: ReconciliationReport = {
    provider: providerKey, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(),
    matched: [], mismatched: [], missingInternal: [], missingAtProvider: [], ledgerBalanced: true, unbalancedTransactions: [],
    safeguardedLedgerBalance: "0", providerNetPosition: "0", positionDifference: "0",
  };

  for (const line of statement) {
    const t = byId.get(line.providerTxnId);
    if (!t) {
      report.missingInternal.push({ providerTxnId: line.providerTxnId, amount: line.amount.toFixed(2), reference: line.reference });
      continue;
    }
    const issues: string[] = [];
    if (!t.amount.equals(line.amount)) issues.push(`amount ${t.amount.toFixed(2)} ≠ provider ${line.amount.toFixed(2)}`);
    if (t.currency !== line.currency) issues.push(`currency ${t.currency} ≠ ${line.currency}`);
    if (t.status !== line.status) issues.push(`status ${t.status} ≠ ${line.status}`);
    if (t.type !== line.type) issues.push(`type ${t.type} ≠ ${line.type}`);
    if (issues.length) {
      report.mismatched.push({ providerTxnId: line.providerTxnId, issue: issues.join("; ") });
      await prisma.providerTransaction.update({ where: { id: t.id }, data: { reconciliation: "MISMATCHED", reconciledAt: new Date() } });
    } else {
      report.matched.push(line.providerTxnId);
      await prisma.providerTransaction.update({ where: { id: t.id }, data: { reconciliation: "MATCHED", reconciledAt: new Date() } });
    }
    byId.delete(line.providerTxnId);
  }
  if (provider.capabilities.automatedReconciliation) {
    for (const t of byId.values()) report.missingAtProvider.push({ providerTxnId: t.providerTxnId, amount: t.amount.toFixed(2) });
  }

  const tb = await trialBalance();
  report.unbalancedTransactions = await unbalancedTransactions();
  report.ledgerBalanced = tb.every((r) => r.balanced) && report.unbalancedTransactions.length === 0;

  // Provider net position across the full history (sandbox can compute it; live partners supply a balance API).
  if (provider.capabilities.automatedReconciliation) {
    const all = await provider.statement(new Date(0), new Date());
    let net = ZERO;
    for (const l of all) {
      if (l.status !== "SUCCEEDED") continue;
      if (l.type === "COLLECTION") net = net.plus(l.amount).minus(l.fee);
      else net = net.minus(l.amount);
    }
    const ledgerBal = await accountBalance(prisma, ACCOUNTS.safeguarded(providerKey, "NGN").code);
    report.safeguardedLedgerBalance = ledgerBal.toFixed(2);
    report.providerNetPosition = net.toFixed(2);
    report.positionDifference = ledgerBal.minus(net).toFixed(2);
  }

  const run = await prisma.reconciliationRun.create({
    data: {
      provider: providerKey, periodStart, periodEnd, matched: report.matched.length,
      mismatched: report.mismatched.length + report.missingAtProvider.length, missingInternal: report.missingInternal.length,
      ledgerBalanced: report.ledgerBalanced && new D(report.positionDifference).isZero(),
      report: report as unknown as Prisma.InputJsonValue, createdById: actor.kind === "user" ? actor.userId : null,
    },
  });
  await audit(prisma, { actor, action: "reconciliation.run", entityType: "ReconciliationRun", entityId: run.id, summary: `Reconciliation ${providerKey}: ${report.matched.length} matched, ${report.mismatched.length} mismatched, ${report.missingInternal.length} missing internally` });
  return { run, report };
}

export const _dec = dec;
