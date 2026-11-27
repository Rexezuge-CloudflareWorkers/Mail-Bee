# Mail-Bee

Mail-Bee monitors a mailbox you own and forwards every new message, unchanged, to the email address you sign in with. It runs entirely on Cloudflare Workers: OAuth connections and webhook subscriptions live in a single Worker, a queue and Workflow do the forwarding, and delivery uses Cloudflare's [Email Sending binding](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

The repo is a trimmed descendant of Mail-Otter: it keeps that project's kit-based layering, identity, OAuth, webhook and background-worker framework as its foundation. The product surface uses only the identity, application, OAuth, subscription, webhook and forwarding paths — AI summaries, actions, RAG, digest, integrations and IMAP providers are not wired into any route or workflow.

## How it works

1. You sign in through **Cloudflare Access**. The Access email becomes your Mail-Bee account and the destination for forwarded mail.
2. You add a mailbox with your **own** Google or Microsoft OAuth client credentials. Credentials are encrypted with AES-GCM before they reach D1.
3. You complete OAuth consent (PKCE + hashed state), then start monitoring. Mail-Bee creates a Gmail watch on your Pub/Sub topic or a Microsoft Graph inbox subscription.
4. A provider webhook (validated by a per-subscription secret / `clientState`) enqueues a notification.
5. The Workflow resolves the account and access token, fetches the original RFC 5322 message (Gmail `format=RAW`, Graph `$value`), deduplicates it in `processed_messages`, and calls `env.EMAIL.send(new EmailMessage(SEND_FROM, yourEmail, raw))`. The only addition is an `X-Mail-Bee-Forwarded` tracing header.
6. Cron renews OAuth tokens and expiring mailbox subscriptions.

## Before you deploy

| Requirement                                                                       | Why                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers account with D1, KV, Queues, Durable Objects, Workflows and Secrets Store | Runtime bindings                                                                                                                                                                          |
| A **Cloudflare Access** application protecting `/user/*`                          | Sign-in. Set `POLICY_AUD` and `TEAM_DOMAIN`.                                                                                                                                              |
| An **onboarded Email Sending domain**                                             | The envelope sender (`SEND_FROM`) must be an address on it.                                                                                                                               |
| A **verified destination address** equal to your sign-in email                    | On the Workers Free plan Email Sending may only deliver to verified destination addresses; other recipients fail with `E_RECIPIENT_PLAN_RESTRICTED`. This is shown in the forwarding log. |
| Your own Google / Microsoft OAuth app                                             | Mail-Bee does not ship global client credentials.                                                                                                                                         |

### Google (Gmail)

1. Enable the Gmail API and configure the OAuth consent screen.
2. Create a **Web application** OAuth client. After you add the mailbox in Mail-Bee, copy the redirect URI shown on its card (`https://<your-worker>/api/oauth2/callback/<applicationId>`) into **Authorized redirect URIs**.
3. Create a Pub/Sub topic. Grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on it.
4. Copy the client ID, secret and `projects/<project>/topics/<topic>` into the Mail-Bee form. After clicking **Start monitoring**, create a push subscription on that topic whose endpoint is the webhook URL displayed on the card (including its `?token=` query string).

### Microsoft (Outlook)

1. Register an app with `User.Read` and `Mail.Read` delegated permissions (offline access is requested automatically).
2. Add the Mail-Bee redirect URI shown on the mailbox card as a web redirect URI.
3. Enter the client ID and secret in the form. Graph subscriptions are created and renewed by Mail-Bee automatically.

## Local development

```bash
pnpm install
pnpm --filter @mail-bee/web dev          # SPA on Vite, proxies /user and /api to :8787
pnpm exec wrangler dev --config ./apps/api/wrangler.template.jsonc
```

`pnpm install` generates `worker-configuration.d.ts` and the SPA shell stub. For a real end-to-end send, use `wrangler dev --remote` so the Email Sending binding and the other bindings are live. Set `DEV_AUTH_EMAIL` locally to bypass Access with a single test identity — never set it in a deployed environment.

## Deployment via GitHub Actions

`Continuous Integration` runs on pull requests, pushes to `main`, manual dispatch, and the `Upstream Sync Integration` event. `Continuous Deployment` runs after CI succeeds on `main`, and can also be started from **Actions → Continuous Deployment → Run workflow** or by dispatching `Upstream Sync Deployment` with an optional `client_payload` of `branch` and `sha`. Both workflows resolve the triggering SHA before checkout, so a deployment always publishes the commit CI actually verified.

The deploy job materializes the gitignored root `wrangler.jsonc` from the `WRANGLER_JSONC` variable (or falls back to `apps/api/wrangler.template.jsonc`), applies the two patch variables, refuses a config that omits a binding or var the template declares, and provisions missing D1 / KV / Secrets Store resources. It then creates any absent Secrets Store secret, applies migrations, builds the SPA, runs a dry-run deploy, and deploys the Worker — retrying each network step. A second job builds the SPA, ensures the Pages project exists, and deploys `apps/web/dist` with the `API_WORKER` service binding to the Worker; `functions/[[path]].ts` proxies browser requests through it.

### Required GitHub secrets and variables

| Kind     | Name                                            | Purpose                                                                                          |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Secret   | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Wrangler access for deploy and backup.                                                           |
| Variable | `WRANGLER_JSONC`                                | Full contents of your root `wrangler.jsonc`. Empty means the template is copied and provisioned. |
| Variable | `WRANGLER_PATCH_JSON`                           | JSON object merged into the config's top level (e.g. `routes`, `vars`). Never put secrets here.  |
| Variable | `WRANGLER_VARS_PATCH_JSON`                      | JSON object of string values merged into `vars` (e.g. `POLICY_AUD`, `TEAM_DOMAIN`, `SEND_FROM`). |
| Variable | `CLOUDFLARE_PAGES_PROJECT_NAME`                 | Pages project name; defaults to `mail-bee-web`.                                                  |

Set `PUBLIC_BASE_URL` to the Worker's public origin and `SEND_FROM` to an address on your onboarded sending domain, either in `WRANGLER_JSONC` or through `WRANGLER_VARS_PATCH_JSON`.

### Manual deployment

Copy `apps/api/wrangler.template.jsonc` to a root `wrangler.jsonc`, replace the placeholder database / KV / secret-store IDs, then:

```bash
pnpm exec wrangler d1 migrations apply mail-bee-db --remote --config ./wrangler.jsonc
pnpm exec wrangler deploy --config ./wrangler.jsonc
```

Run `pnpm --filter @mail-bee/web build` first so the embedded SPA shell is current.

## Database backups

`Backup D1 Database` exports the deployed D1 database daily at 04:15 UTC and on manual dispatch. It is off until you configure at least one destination. Every configured destination requires `BACKUP_ENCRYPTION_KEY` — exports contain user addresses, OAuth sessions and encrypted credential blobs, so an unencrypted dump is a working set of user data.

| Secret                                                  | Purpose                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `BACKUP_ENCRYPTION_KEY`                                 | Passphrase for AES-256-CBC + PBKDF2 encryption (required for any destination).         |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` | S3-compatible destination (R2, MinIO, B2, …). Optional `S3_ENDPOINT`, `S3_REGION`.     |
| `WEBDAV_URL`, `WEBDAV_USER`, `WEBDAV_PASSWORD`          | WebDAV destination. Optional `WEBDAV_VENDOR`, `WEBDAV_BASE_PATH` (default `mail-bee`). |
| `BACKUP_RETENTION_DAYS`                                 | Prune age for old artifacts; defaults to 30.                                           |

Artifacts are named `mail-bee_prod_<UTC timestamp>.sql.xz.enc` and live under `mail-bee/production` in S3 or under the WebDAV base path. To restore, download an artifact, decrypt with `openssl enc -d -aes-256-cbc -salt -pbkdf2 -iter 100000 -pass env:BACKUP_ENCRYPTION_KEY`, decompress with `xz -d`, and import the SQL with `wrangler d1 execute`. The export job refuses to back up a database that provisioning created in the same run — such a database holds no user data.

`Backup Main Branch` mirrors `main` to Azure DevOps or GitLab on push and monthly, when the corresponding `BACKUP_REPO_*_SSH_KEY` and `BACKUP_REPO_*_REPO_URL` secrets are set. Forks skip this workflow.

## Repository automation

- **Dependabot** opens weekly npm update PRs; `Continuous Integration` enables auto-merge once every check passes.
- **Upstream Sync** runs weekly for forks, pulling `main` from `Rexezuge-CloudflareWorkers/Mail-Bee` and dispatching CI (then CD) when new commits arrive. The **Sync fork** button does not fire `push`, so it does not trigger workflows; use **Actions → Continuous Deployment → Run workflow** in that case.
- **Scheduled Version Update** commits a timestamp to `.github/.version` twice a month.

## Checks

```bash
pnpm run build          # SPA build (also regenerates the embedded shell)
pnpm run checks         # typecheck, lint, format, migration lock, SPA shell, unit + SPA tests
```

`verify:spa-shell` requires a build first: a fresh clone carries only an empty `spa-shell.ts` stub, so verification without `pnpm run build` is meant to fail.

## Layout

| Path                        | Contents                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `apps/api`                  | Deployed Worker: Hono/Chanfana routes, Access middleware, queue and cron handlers    |
| `apps/background`           | Workflow, queue dispatcher, token-refresh and cron Durable Objects                   |
| `apps/web`                  | React dashboard                                                                      |
| `packages/shared`           | Domain types, constants, request schemas                                             |
| `packages/backend-runtime`  | Config, DI and worker bases from `@rexezuge/runtime`                                 |
| `packages/backend-data`     | D1 DAOs and AES-GCM credential encryption                                            |
| `packages/provider-clients` | Gmail / Graph REST calls, OAuth strategies, webhook secrets                          |
| `packages/backend-services` | Identity, applications, OAuth, watch subscriptions, webhooks and `ForwardingService` |

See `AGENTS.md` and the scoped guides for the rules that apply to each area.
