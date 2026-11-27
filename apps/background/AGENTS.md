# apps/background

A library of worker classes bundled into the API Worker by `apps/api/src/index.ts`.

- `EmailEventsDispatcherWorker` — queue consumer; creates deterministic Workflow instances from queued notifications and acks/retries the batch.
- `EmailProcessingWorkflow` — the forwarding pipeline: resolve mailbox, list new Gmail ids from history (or use the Outlook message id), fetch raw MIME, dedup, send, advance history. Each forward is a durable step with retries.
- `OAuth2TokenRefreshWorker` — Durable Object doing serialized token exchange and refresh; writes the access-token cache.
- `CronTasksWorker` — Durable Object running the registered tasks in two phases.
- `scheduled/TaskRegistry.ts` — Mail-Bee's cron surface: token refresh, subscription renewal, session and forwarding-log pruning. Do not re-add AI/action/IMAP tasks. Tasks use the SDK's `TaskRegistry` and extend `AbstractScheduledTask` via `scheduled/MailBeeScheduledTask.ts`; that adapter binds the run-record DAO, routes logs through `logTokenAdjacentError`, redacts `describeFailure` and swallows task errors because the cron Durable Object reports batch failure itself.

Workflow and cron errors that handle credentials must go through `logTokenAdjacentError`: log the classification, never the caught error, which may carry a bearer token or message body. Persist the failure in `processed_messages` or `oauth2_access_token_refresh_status` instead.
