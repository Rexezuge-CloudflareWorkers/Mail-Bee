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

Copy `apps/api/wrangler.template.jsonc` to `wrangler.jsonc` for your deployment, replace the placeholder database/KV/secret-store IDs, set `PUBLIC_BASE_URL` to the Worker's public origin and `SEND_FROM` to your sending address, then:

```bash
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy --config ./apps/api/wrangler.template.jsonc
```

## Checks

```bash
pnpm run checks        # typecheck, lint, format, migration lock, unit + SPA tests
pnpm run build         # SPA build (also regenerates the embedded shell)
```

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
