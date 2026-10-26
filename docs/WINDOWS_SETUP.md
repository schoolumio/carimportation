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
