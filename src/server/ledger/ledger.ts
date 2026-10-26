// Double-entry ledger. Entries are immutable (DB trigger) and every transaction must balance per currency
// (deferred constraint trigger). Corrections are made with reversal transactions, never edits.
import type { Beneficiary, EntryDirection, LedgerAccountType } from "@prisma/client";
import type { DbClient, Tx } from "@/server/db";
import { prisma } from "@/server/db";
import { D, type Dec, ZERO, dec, sum } from "@/lib/money";
import { invalid } from "@/lib/errors";
import { tbl } from "@/server/db-schema";

export const ACCOUNTS = {
  safeguarded: (provider: string, ccy: string) => ({ code: `ASSET:SAFEGUARDED:${provider}:${ccy}`, name: `Funds held with ${provider} (${ccy})`, type: "ASSET" as const, currency: ccy }),
  buyerFundsHeld: (orderId: string, ccy: string) => ({ code: `LIAB:BUYER_FUNDS:${orderId}`, name: `Buyer funds held for order`, type: "LIABILITY" as const, currency: ccy, orderId }),
  dealerPayable: (dealerOrgId: string, ccy: string) => ({ code: `LIAB:DEALER_PAYABLE:${dealerOrgId}:${ccy}`, name: `Payable to dealer`, type: "LIABILITY" as const, currency: ccy, dealerOrgId }),
  thirdPartyPayable: (b: Beneficiary, ccy: string) => ({ code: `LIAB:PAYABLE:${b}:${ccy}`, name: `Payable to ${b.toLowerCase().replace(/_/g, " ")}`, type: "LIABILITY" as const, currency: ccy }),
  platformRevenue: (ccy: string) => ({ code: `REV:PLATFORM:${ccy}`, name: `Platform revenue`, type: "REVENUE" as const, currency: ccy }),
  processingFees: (ccy: string) => ({ code: `EXP:PROCESSING_FEES:${ccy}`, name: `Payment processing fees`, type: "EXPENSE" as const, currency: ccy }),
};

export interface AccountSpec {
  code: string;
  name: string;
  type: LedgerAccountType;
  currency: string;
  orderId?: string;
  dealerOrgId?: string;
}

export async function ensureAccount(db: DbClient, spec: AccountSpec) {
  return db.ledgerAccount.upsert({
    where: { code: spec.code },
    create: { code: spec.code, name: spec.name, type: spec.type, currency: spec.currency, orderId: spec.orderId, dealerOrgId: spec.dealerOrgId },
    update: {},
  });
}

export interface EntrySpec {
  account: AccountSpec;
  direction: EntryDirection;
  amount: Dec;
}

export interface PostInput {
  reference: string; // unique — makes posting idempotent
  kind: string;
  description: string;
  orderId?: string | null;
  createdById?: string | null;
  isDemo?: boolean;
  entries: EntrySpec[];
}

export function assertBalanced(entries: EntrySpec[]) {
  const byCcy = new Map<string, Dec>();
  for (const e of entries) {
    if (!e.amount.gt(0)) throw invalid("Ledger entry amounts must be positive");
    const signed = e.direction === "DEBIT" ? e.amount : e.amount.negated();
    byCcy.set(e.account.currency, (byCcy.get(e.account.currency) ?? ZERO).plus(signed));
  }
  for (const [ccy, bal] of byCcy) if (!bal.isZero()) throw invalid(`Ledger transaction unbalanced in ${ccy}: ${bal.toFixed(2)}`);
}

/**
 * Post a balanced transaction. Idempotent on `reference`: a second call with the same reference
 * returns the existing transaction without creating entries.
 */
export async function post(tx: Tx, input: PostInput) {
  const existing = await tx.ledgerTransaction.findUnique({ where: { reference: input.reference } });
  if (existing) return { transaction: existing, created: false };
  assertBalanced(input.entries);
  const t = await tx.ledgerTransaction.create({
    data: { reference: input.reference, kind: input.kind, description: input.description, orderId: input.orderId, createdById: input.createdById, isDemo: input.isDemo ?? false },
  });
  for (const e of input.entries) {
    const acct = await ensureAccount(tx, e.account);
    await tx.ledgerEntry.create({ data: { transactionId: t.id, accountId: acct.id, direction: e.direction, amount: e.amount, currency: e.account.currency } });
  }
  return { transaction: t, created: true };
}

/** Reverse a transaction by posting equal and opposite entries. The original is never modified. */
export async function reverse(tx: Tx, transactionId: string, reason: string, createdById: string | null) {
  const original = await tx.ledgerTransaction.findUniqueOrThrow({ where: { id: transactionId }, include: { entries: { include: { account: true } } } });
  const already = await tx.ledgerTransaction.findUnique({ where: { reversalOfId: transactionId } });
  if (already) return already;
  const t = await tx.ledgerTransaction.create({
    data: { reference: `reversal:${original.reference}`, kind: "REVERSAL", description: `Reversal: ${reason}`, orderId: original.orderId, reversalOfId: original.id, createdById, isDemo: original.isDemo },
  });
  for (const e of original.entries) {
    await tx.ledgerEntry.create({ data: { transactionId: t.id, accountId: e.accountId, direction: e.direction === "DEBIT" ? "CREDIT" : "DEBIT", amount: e.amount, currency: e.currency } });
  }
  return t;
}

/** Natural-sign balance: assets/expenses are debit-normal; liabilities/revenue/equity are credit-normal. */
export async function accountBalance(db: DbClient, code: string): Promise<Dec> {
  const acct = await db.ledgerAccount.findUnique({ where: { code } });
  if (!acct) return new D(0);
  const rows = await db.ledgerEntry.groupBy({ by: ["direction"], where: { accountId: acct.id }, _sum: { amount: true } });
  const debits = dec(rows.find((r) => r.direction === "DEBIT")?._sum.amount);
  const credits = dec(rows.find((r) => r.direction === "CREDIT")?._sum.amount);
  return acct.type === "ASSET" || acct.type === "EXPENSE" ? debits.minus(credits) : credits.minus(debits);
}

export async function orderHeldBalance(db: DbClient, orderId: string, currency: string): Promise<Dec> {
  return accountBalance(db, ACCOUNTS.buyerFundsHeld(orderId, currency).code);
}

/** Global trial balance: total debits must equal total credits per currency. */
export async function trialBalance(db: DbClient = prisma) {
  const rows = await db.ledgerEntry.groupBy({ by: ["currency", "direction"], _sum: { amount: true } });
  const ccys = [...new Set(rows.map((r) => r.currency))];
  return ccys.map((c) => {
    const debits = dec(rows.find((r) => r.currency === c && r.direction === "DEBIT")?._sum.amount);
    const credits = dec(rows.find((r) => r.currency === c && r.direction === "CREDIT")?._sum.amount);
    return { currency: c, debits, credits, balanced: debits.equals(credits) };
  });
}

/** Verify every individual transaction balances (defence in depth over the DB trigger). */
export async function unbalancedTransactions(db: DbClient = prisma): Promise<string[]> {
  const rows = await db.$queryRaw<{ transactionId: string }[]>`
    SELECT "transactionId" FROM ${tbl("LedgerEntry")}
    GROUP BY "transactionId", currency
    HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) <> 0`;
  return rows.map((r) => r.transactionId);
}

export async function accountsWithBalances(db: DbClient = prisma) {
  const accts = await db.ledgerAccount.findMany({ orderBy: { code: "asc" } });
  const out = [];
  for (const a of accts) out.push({ ...a, balance: await accountBalance(db, a.code) });
  return out;
}

export const sumDec = sum;
