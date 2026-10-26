// MANUAL PILOT provider: payments are made by bank transfer to a designated account and confirmed by
// finance staff against bank statements under maker-checker control. This is NOT automated escrow and must
// only be used under a documented, legally reviewed payment arrangement.
import { getConfig } from "@/server/admin/config";
import type { PaymentProvider } from "./provider";
import { invalid } from "@/lib/errors";

export const manualPilotProvider: PaymentProvider = {
  key: "MANUAL_PILOT",
  displayName: "Manual pilot (bank transfer, staff-verified)",
  isLive: false,
  capabilities: { bankTransfer: true, cards: false, partialRefunds: true, milestoneRelease: false, webhooks: false, automatedReconciliation: false },

  async createCollection(intent) {
    const acct = (await getConfig("payments.manualPilotAccount")) as { bankName: string; accountName: string; accountNumber: string; note: string };
    return {
      providerRef: `manual:${intent.reference}`,
      instructions: {
        method: "BANK_TRANSFER", bankName: acct.bankName, accountName: acct.accountName, accountNumber: acct.accountNumber,
        reference: intent.reference, amount: intent.amount.toFixed(2), currency: intent.currency, expiresAt: intent.expiresAt.toISOString(),
        notes: [
          "PILOT: Payment is confirmed manually by two finance staff against the bank statement. This is not automated escrow.",
          "Uploading a transfer receipt does not confirm payment.",
          acct.note,
        ],
      },
    };
  },
  async refund(p) {
    if (!p.externalRef) throw invalid("Manual refunds require the bank transfer reference used to return funds.");
    return { providerTxnId: `manual:${p.externalRef}`, status: "SUCCEEDED" };
  },
  async payout(p) {
    if (!p.externalRef) throw invalid("Manual payouts require the bank transfer reference.");
    return { providerTxnId: `manual:${p.externalRef}`, status: "SUCCEEDED" };
  },
  async statement() {
    return []; // Bank statements are reconciled manually in the pilot.
  },
  verifyWebhook() {
    return false;
  },
  parseWebhook() {
    throw new Error("Manual pilot provider does not send webhooks");
  },
};
