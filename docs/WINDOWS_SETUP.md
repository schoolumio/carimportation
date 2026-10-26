# Windows setup (Command Prompt, `cmd.exe`)

## 1. Install prerequisites
1. Node.js 20 LTS or 22 LTS from https://nodejs.org (tick "Add to PATH").
2. PostgreSQL 16 from https://www.postgresql.org/download/windows/ (remember the `postgres` password; keep port 5432). The installer adds `psql` under `C:\Program Files\PostgreSQL\16\bin`.
3. Git for Windows (optional, to clone the repository).

Open a **new** Command Prompt after installing so PATH changes apply.

## 2. Create the databases
```bat
set PATH=%PATH%;C:\Program Files\PostgreSQL\16\bin
psql -U postgres -c "CREATE USER autovault WITH PASSWORD 'autovault' CREATEDB;"
psql -U postgres -c "CREATE DATABASE autovault_dev OWNER autovault;"
psql -U postgres -c "CREATE DATABASE autovault_test OWNER autovault;"
```

## 3. Configure and install
```bat
cd C:\path\to\carimportation
copy .env.example .env
notepad .env
```
In `.env`, set at least `APP_SECRET` and `DATA_ENCRYPTION_KEY`. Generate values with:
```bat
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Then:
```bat
npm install
npx prisma migrate deploy
npm run db:seed
```

## 4. Run
```bat
npm run dev
```
Open http://localhost:3000. In a second Command Prompt window:
```bat
cd C:\path\to\carimportation
npm run worker
```

## 5. Tests and build
```bat
set TEST_DATABASE_URL=postgresql://autovault:autovault@localhost:5432/autovault_test
npm test
npm run typecheck
npm run build
npm start
```

## Starting over (development database only)
This deletes all data in `autovault_dev`. Never run it against production.
```bat
npx prisma migrate reset
npm run db:seed
```

## Troubleshooting
- `'psql' is not recognized` — run the `set PATH=...` line above, or use the full path.
- `P1001: Can't reach database server` — check the PostgreSQL Windows service is running (`services.msc`) and `DATABASE_URL` in `.env`.
- `Invalid environment configuration` — `DATA_ENCRYPTION_KEY` must be exactly 64 hex characters; `APP_SECRET` at least 32 characters.
- Port in use — `set PORT=3001 && npm run dev`.

### `npm error Exit handler never called!`
This is a bug inside npm itself (not this project), usually triggered on Windows by a corrupted npm cache, a dropped network connection, antivirus locking files, or very long folder paths. Fix:
```bat
:: 1. Move the project to a short path (deep "Downloads\...\..." paths can exceed Windows' 260-character limit inside node_modules)
mkdir C:\dev
move "%USERPROFILE%\Downloads\carimportation-claude-dazzling-dijkstra-jb8w7e\carimportation-claude-dazzling-dijkstra-jb8w7e" C:\dev\carimportation
cd C:\dev\carimportation

:: 2. Clear the cache and any partial install
npm cache clean --force
rmdir /s /q node_modules

:: 3. Install exactly what the lockfile specifies
npm ci
```
If it still fails: check `node -v` is 20.x or 22.x LTS, update npm with `npm install -g npm@10`, temporarily pause antivirus real-time scanning for `C:\dev`, and retry. The last lines of the log file named in the error show the real cause.

The `npm warn deprecated eslint@9...` message is only a warning and can be ignored.

### `npm ci` fails with `EUSAGE ... lock file's @emnapi/... does not satisfy ...`
Some npm versions on Windows compute optional WebAssembly fallback packages (`@emnapi/*`) differently from the version that wrote `package-lock.json`. These packages are not used on Windows x64. Let npm reconcile the lockfile:
```bat
npm install
```
(`npm install` updates `package-lock.json` locally; `npm ci` refuses to.) The install runs `prisma generate` automatically afterwards. If your npm version reports that install scripts were skipped, run `npm install-scripts approve prisma @prisma/engines @prisma/client esbuild unrs-resolver` and then `npx prisma generate`.

### `P3018 ... type "PaymentMethod" already exists` (shared or hosted database, e.g. Neon)
The database already contains another application's tables. Give AutoVault its own space instead of mixing them:
- **Separate schema** (simplest): add `&schema=autovault` to the end of `DATABASE_URL` (use `?schema=autovault` if the URL has no `?`), or
- **Separate database**: create a new database (e.g. `autovault`) in your provider's console and use its connection string.

The failed attempt is rolled back, but it leaves one row in that database's existing `_prisma_migrations` table (`20261026000000_init`, unfinished), which belongs to the other application. Remove it in the provider's SQL editor so the other application's own migrations are not blocked:
```sql
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261026000000_init' AND finished_at IS NULL;
```
For Neon, prefer the direct (non-`-pooler`) connection string when running migrations.

### Seed stopped part-way, then says "Database already contains users"
Fix the cause first (e.g. `DATA_ENCRYPTION_KEY` must be exactly 64 characters of 0-9/a-f; generate it with the `node -e` command above). Then empty **only AutoVault's schema** in your database's SQL editor and re-run:
```sql
DROP SCHEMA autovault CASCADE;
```
```bat
npx prisma migrate deploy
npm run db:seed
```
Do not change `DATA_ENCRYPTION_KEY` after seeding real data: values encrypted with the old key become unreadable.
