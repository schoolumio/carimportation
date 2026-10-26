# Operations runbook

## Backups
- **Database**: daily full `pg_dump -Fc` plus continuous WAL archiving / point-in-time recovery (managed Postgres recommended). Keep 35 days; encrypt at rest; copy off-site.
  ```bash
  pg_dump -Fc "$DATABASE_URL" -f autovault-$(date +%F).dump
  ```
  Windows CMD: `pg_dump -Fc "%DATABASE_URL%" -f autovault.dump`
- **Documents** (`STORAGE_DIR` or bucket): daily incremental sync with versioning.
- **Secrets**: `DATA_ENCRYPTION_KEY` must be backed up separately and securely — without it encrypted fields are unrecoverable.

## Restore (test quarterly)
```bash
createdb autovault_restore
pg_restore -d autovault_restore --no-owner autovault-YYYY-MM-DD.dump
DATABASE_URL=.../autovault_restore npx prisma migrate status
```
After restore: verify `/admin/audit?verify=1` (hash chain), run reconciliation for the gap period, compare the safeguarded-funds ledger balance with the provider statement.

## Monitoring
- `/api/health`; worker heartbeat (job lag); error logs from Next.js and worker (ship to Sentry/OpenTelemetry — not yet wired).
- Daily reconciliation run must be clean; any `MISMATCHED`/`missingInternal` is a P1 for finance.
- Alerts: failed/DEAD jobs, webhook `REJECTED` spikes, login lockout spikes, trial balance not balanced (should be impossible — investigate immediately).

## Key rotation
- `APP_SECRET`: rotate any time; only invalidates in-flight download links.
- `DATA_ENCRYPTION_KEY`: introduce versioned keys (`v2.` prefix) in `src/lib/crypto.ts`, re-encrypt `User.mfaSecretEnc`, `BuyerProfile.identityNumberEnc`, `DealerOrganization.bankAccountNumberEnc` with a migration script, then retire the old key.
- Webhook secrets: coordinate with the provider (dual-secret window).

## Data retention (proposal — confirm with counsel)
| Data | Retention |
|---|---|
| Ledger, payments, settlements, contracts, audit log | statutory financial-record period (confirm; commonly ≥ 6 years) — never deleted by the app (DB triggers) |
| Identity documents | duration required by AML rules after relationship ends, then delete document file and anonymise profile |
| Support conversations, notifications | 3 years |
| Sessions, reset tokens | purge 30 days after expiry |
| Marketing/contact messages | 2 years or on request |
Deletion requests: deactivate the user (`status=DELETED`), anonymise personal fields where not legally required, keep financial/audit records.

## Incident runbooks
- **Suspected fraudulent listing**: suspend listing (Admin → Listings), freeze affected orders by opening a dispute or cancelling before purchase authorisation, review dealer → suspend if needed.
- **Payment received on a cancelled order**: appears as finance alert; request + approve refund.
- **Unmatched provider transaction**: identify payer via provider, attach to correct intent only through a documented manual process; otherwise refund.
- **Account compromise**: Admin → Users → suspend (revokes sessions); force password reset; review audit log for the actor.
