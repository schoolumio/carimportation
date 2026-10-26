-- Integrity guards that must hold regardless of application code.

-- 1. Append-only tables: forbid UPDATE and DELETE at row level.
CREATE OR REPLACE FUNCTION av_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION av_forbid_mutation();
CREATE TRIGGER order_transition_append_only BEFORE UPDATE OR DELETE ON "OrderTransition"
  FOR EACH ROW EXECUTE FUNCTION av_forbid_mutation();
CREATE TRIGGER tracking_event_append_only BEFORE UPDATE OR DELETE ON "TrackingEvent"
  FOR EACH ROW EXECUTE FUNCTION av_forbid_mutation();
CREATE TRIGGER ledger_entry_append_only BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION av_forbid_mutation();
CREATE TRIGGER ledger_transaction_append_only BEFORE UPDATE OR DELETE ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION av_forbid_mutation();
CREATE TRIGGER eta_revision_append_only BEFORE UPDATE OR DELETE ON "EtaRevision"
  FOR EACH ROW EXECUTE FUNCTION av_forbid_mutation();

-- 2. Ledger entries must be strictly positive amounts.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_entry_amount_positive CHECK (amount > 0);

-- 3. Every ledger transaction must balance (debits = credits) per currency at commit time.
CREATE OR REPLACE FUNCTION av_check_ledger_balance() RETURNS trigger AS $$
DECLARE
  imbalance RECORD;
BEGIN
  SELECT currency,
         SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS debits,
         SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS credits
    INTO imbalance
    FROM "LedgerEntry"
   WHERE "transactionId" = NEW."transactionId"
   GROUP BY currency
  HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) <> 0
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Ledger transaction % is unbalanced in % (debits %, credits %)',
      NEW."transactionId", imbalance.currency, imbalance.debits, imbalance.credits
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced
  AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION av_check_ledger_balance();

-- 4. Ledger entry currency must match its account currency.
CREATE OR REPLACE FUNCTION av_check_entry_currency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LedgerAccount" a WHERE a.id = NEW."accountId" AND a.currency = NEW.currency) THEN
    RAISE EXCEPTION 'Ledger entry currency % does not match account currency', NEW.currency
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_currency_matches BEFORE INSERT ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION av_check_entry_currency();

-- 5. Money sanity checks.
ALTER TABLE "PaymentIntent" ADD CONSTRAINT payment_intent_amount_positive CHECK (amount > 0);
ALTER TABLE "Refund" ADD CONSTRAINT refund_amount_positive CHECK (amount > 0);
ALTER TABLE "SettlementInstruction" ADD CONSTRAINT settlement_amount_positive CHECK (amount > 0);
ALTER TABLE "Refund" ADD CONSTRAINT refund_dual_control CHECK ("approvedById" IS NULL OR "approvedById" <> "requestedById");
ALTER TABLE "SettlementInstruction" ADD CONSTRAINT settlement_dual_control CHECK ("approvedById" IS NULL OR "approvedById" <> "requestedById");
ALTER TABLE "ProviderTransaction" ADD CONSTRAINT manual_confirmation_dual_control CHECK ("approvedById" IS NULL OR "approvedById" <> "recordedById");
