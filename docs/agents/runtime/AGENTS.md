# Bindings and runtime configuration

`apps/api/wrangler.template.jsonc` is the source of truth. Deployments materialize a root `wrangler.jsonc` from it (or from the `WRANGLER_JSONC` variable) via `scripts/deploy/prepare-wrangler-config.ts`; no committed `wrangler.jsonc`. The script rewrites the template's `main`, asset directory and `migrations_dir` to root-relative paths and provisions placeholder D1/KV/Secrets Store IDs. After changing bindings run `pnpm run typegen`.

| Binding                                      | Purpose                                                               |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `DB` (D1)                                    | Accounts, applications, subscriptions, OAuth sessions, forwarding log |
| `OAUTH2_TOKEN_CACHE` (KV)                    | Encrypted access-token cache                                          |
| `EMAIL_EVENTS_QUEUE`                         | Provider webhook → workflow                                           |
| `CRON_TASKS`, `OAUTH2_TOKEN_REFRESHERS` (DO) | Cron fan-out and serialized token refresh                             |
| `EMAIL_PROCESSING_WORKFLOW`                  | Durable forwarding steps                                              |
| `AES_ENCRYPTION_KEY_SECRET`                  | Secrets Store key for credentials and tokens                          |
| `EMAIL` (`send_email`)                       | Cloudflare Email Sending binding used by `ForwardingService`          |

Vars: `TEAM_DOMAIN` + `POLICY_AUD` (Access), `PUBLIC_BASE_URL` (OAuth/webhook URLs), `SEND_FROM` (envelope sender on an onboarded sending domain), plus token/watch renewal windows. `DEV_AUTH_EMAIL` is local-only.

Email Sending constraints: 25 MiB total message size, ≤50 recipients, and on Workers Free only verified destination addresses may receive. `E_RECIPIENT_PLAN_RESTRICTED` means the sign-in address is not a verified destination address; treat it as a permanent configuration error.
