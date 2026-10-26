// Payment / protected-funds provider abstraction.
// IMPORTANT: No live escrow provider is integrated. A LIVE_PARTNER adapter must only be added after the
// provider's CBN authorisation, settlement model, account structure, limits, dispute and refund
// procedures have been verified and contracted (see docs/INTEGRATIONS.md).
import type { PaymentIntent, PaymentProviderKey, ProviderTxnStatus, ProviderTxnType } from "@prisma/client";
import type { Dec } from "@/lib/money";

export interface ProviderCapabilities {
  bankTransfer: boolean;
  cards: boolean;
  partialRefunds: boolean;
  milestoneRelease: boolean; // can hold funds and release portions on instruction
  webhooks: boolean;
  automatedReconciliation: boolean;
}

export interface PaymentInstructions {
  method: "BANK_TRANSFER" | "CARD";
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  reference: string;
  amount: string;
  currency: string;
  expiresAt: string;
  notes: string[];
  checkoutUrl?: string;
}

export interface StatementLine {
  providerTxnId: string;
  type: ProviderTxnType;
  status: ProviderTxnStatus;
  amount: Dec;
  fee: Dec;
  currency: string;
  reference: string;
  occurredAt: Date;
}

export interface MoneyMovementResult {
  providerTxnId: string;
  status: ProviderTxnStatus;
}

export interface NormalizedPaymentEvent {
  eventId: string;
  type: "collection.succeeded" | "collection.failed" | "collection.reversed" | "refund.succeeded" | "refund.failed" | "payout.succeeded" | "payout.failed";
  providerTxnId: string;
  reference: string;
  amount: string;
  fee: string;
  currency: string;
  occurredAt: string;
}

export interface PaymentProvider {
  key: PaymentProviderKey;
  displayName: string;
  isLive: boolean;
  capabilities: ProviderCapabilities;
  createCollection(intent: PaymentIntent): Promise<{ providerRef: string; instructions: PaymentInstructions }>;
  refund(p: { reference: string; amount: Dec; currency: string; externalRef?: string }): Promise<MoneyMovementResult>;
  payout(p: { reference: string; amount: Dec; currency: string; beneficiary: string; externalRef?: string }): Promise<MoneyMovementResult>;
  statement(from: Date, to: Date): Promise<StatementLine[]>;
  verifyWebhook(rawBody: string, headers: Record<string, string | null>): boolean;
  parseWebhook(rawBody: string): NormalizedPaymentEvent;
}
