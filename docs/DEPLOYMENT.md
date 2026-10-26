# Deployment

## Environment variables
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. Use TLS (`?sslmode=require`) in production. |
| `APP_URL` | yes | Public base URL (used in emails). |
| `APP_SECRET` | yes | ≥32 chars random; signs document links. Rotating invalidates outstanding links only. |
| `DATA_ENCRYPTION_KEY` | yes | 64 hex chars (32 bytes) for AES-256-GCM field encryption. Store in a secrets manager; see key rotation in OPERATIONS.md. |
| `STORAGE_DIR` | no | Private document directory (default `./storage/private`). Must be persistent and backed up. |
| `PAYMENT_PROVIDER` | no | `SANDBOX` (default) or `MANUAL_PILOT`. `LIVE_PARTNER` is rejected until implemented. |
| `SANDBOX_WEBHOOK_SECRET` | sandbox | HMAC secret for sandbox webhooks. |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `EMAIL_FROM` | no | `console` or `smtp`. |
| `SMS_PROVIDER`, `WHATSAPP_PROVIDER` | no | `none` or `console` until real adapters exist. |
| `NEXT_PUBLIC_BRAND_*`, `NEXT_PUBLIC_SUPPORT_*` | no | Brand name, tagline, legal entity, support contacts (build-time). |
| `TEST_DATABASE_URL` | tests | Must end in `_test`. |

Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Database setup
```bash
createuser -P autovault
createdb -O autovault autovault
DATABASE_URL=... npx prisma migrate deploy     # applies schema + integrity triggers
```
Do **not** run the demo seed in production. Create the first super administrator with `ADMIN_PASSWORD=... npx tsx --env-file=.env scripts/create-admin.ts admin@company.com "Full Name"` (also syncs roles/permissions), then create staff from Admin → Users. The application connects as a normal role; the role must not be a superuser (triggers would still apply, but least privilege matters).

## Build and run
```bash
npm ci
npm run build
npm start                 # web (PORT env, default 3000)
npm run worker            # at least one worker process
```
Put the app behind a TLS-terminating reverse proxy (nginx/Caddy/cloud LB) that sets `X-Forwarded-For`. Serve over HTTPS only (cookies are `secure` in production).

## Docker
```bash
docker compose up --build            # postgres + web + worker
docker compose run --rm web npx prisma migrate deploy
```
See `Dockerfile` and `docker-compose.yml`. Mount `STORAGE_DIR` on a persistent volume.

## Scaling notes
- The web tier is stateless except for the in-memory rate limiter — replace with Redis/DB before running several instances.
- Workers can scale horizontally (`FOR UPDATE SKIP LOCKED`).
- Use object storage instead of local disk for multiple web instances.

## Health
`GET /api/health` → DB connectivity, count of stale jobs, active payment provider. Alert if `ok=false` or `staleJobs > 0` for 15 minutes.
