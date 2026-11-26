# AGENTS.md

Mail-Bee is a Cloudflare Workers product. A signed-in Cloudflare Access user registers their own Gmail/Outlook OAuth client, starts monitoring that mailbox, and every new message is forwarded byte-for-byte to the user's sign-in address through the `EMAIL` send binding.

## Commands

```bash
pnpm install
pnpm run checks
pnpm run build
pnpm exec wrangler dev --config ./apps/api/wrangler.template.jsonc
```

Plain `pnpm` is canonical. `pnpm run checks` runs typecheck, lint, format, migration lock and both test suites. All must pass before committing.

## Import direction

```
Layer 0: shared                          — no @mail-bee/* deps
Layer 1: backend-runtime                 → shared only
Layer 2: backend-data, provider-clients  → shared only
Layer 3: backend-services                → layers 0–2
Layer 5: apps/background                 → layers 0–3
         apps/api                        → layers 0–3 + background
         apps/web                        → no @mail-bee/* imports
```

Enforced by `defineRepoLintConfig({ scope: '@mail-bee' })` in `eslint.config.mjs`.

## Composition

Per-request DI: `createRequestScope(env)` and `scope.get(Tokens.X)` from `@mail-bee/backend-services/composition`. Do not construct services with `new Service(env)` inside routes; background workers may construct them directly. `RequestScopeEnv` and `SCOPE_ENV_COVERAGE` make a missing binding a typecheck error.

## Identity

`users.id` is the account key. `users.email` is the frozen anchor used by `*_email` columns; `users.current_email` is the sign-in address. **The forwarding destination is `current_email`**, not `provider_email` (the monitored mailbox). Routes pass `AccountIdentity`, never a bare address.

## The kit

`@rexezuge/*` (pinned to one copy via `pnpm-workspace.yaml` overrides) provides the error taxonomy, D1 base DAO, Access auth, security headers, worker bases, DI container, identity helpers and the Vite SPA shell plugin. `@rexezuge/*` must stay inside Vite's pipeline (`noExternal`) because the worker bases extend classes from `cloudflare:workers`.

## Product rules

- OAuth credentials are user-supplied and encrypted with `AES_ENCRYPTION_KEY_SECRET`; never log them or put them in vars.
- Webhook endpoints are public but validate a per-subscription secret / `clientState`; they are deliberately not rate-limited.
- Forwarding uses the legacy `EmailMessage` API so the original MIME is preserved. Keep `SEND_FROM` on an onboarded domain and enforce the 25 MiB limit.
- Free-plan recipients must be verified destination addresses; surface `E_RECIPIENT_PLAN_RESTRICTED` in the forwarding log rather than retrying forever.

## Index

| Area                     | Guide                                 |
| ------------------------ | ------------------------------------- |
| API routes, auth         | `apps/api/AGENTS.md`                  |
| Background workers, cron | `apps/background/AGENTS.md`           |
| Web SPA                  | `apps/web/AGENTS.md`                  |
| DAOs, schema             | `packages/backend-data/AGENTS.md`     |
| Services, forwarding     | `packages/backend-services/AGENTS.md` |
| Bindings, wrangler       | `docs/agents/runtime/AGENTS.md`       |
| Tests                    | `docs/agents/testing/AGENTS.md`       |
