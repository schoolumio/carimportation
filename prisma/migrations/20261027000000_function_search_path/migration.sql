-- Pin the schema used inside trigger functions to the schema the migration runs in, so the ledger checks work
-- even when the application's connection search_path does not include it (e.g. ?schema=... behind some proxies).
ALTER FUNCTION av_check_ledger_balance() SET search_path FROM CURRENT;
ALTER FUNCTION av_check_entry_currency() SET search_path FROM CURRENT;
