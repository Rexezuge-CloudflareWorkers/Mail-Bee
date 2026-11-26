# packages/backend-data

D1 DAOs and encryption. `migrations/0001_initial.sql` is the fresh-install schema; `migrations/migrations.lock.json` is verified in CI. Never edit an applied migration — add a new one and lock it with `pnpm run migrations:lock`.

DAOs are sql-first via `@rexezuge/d1`'s `BaseDAO` (`run/first/all(sql, [args])`). Ownership predicates come from `userScope(scope, alias)` in `dao/userScope.ts`; always scope reads and writes by the account, not by the address supplied by the caller.

Credentials are sealed with AES-GCM (`crypto/aes-gcm.ts`) using the master key from `AES_ENCRYPTION_KEY_SECRET`. Never return decrypted secrets from an API response; `ConnectedApplicationMetadata` intentionally excludes `credentials`.

`ForwardingService` uses `ProcessedMessageDAO.tryStart` for deduplication and `markSummarized`/`markSkipped`/`markError` for outcomes. The status name `summarized` is retained from Mail-Otter's schema and means "forwarded" in Mail-Bee's UI.
