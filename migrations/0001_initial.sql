-- Mail-Bee initial schema, adapted from Mail-Otter migrations 0021-0029.

-- Source: 0021_squash.sql
-- Migration 0021: Squash of migrations 0001–0020
-- Complete schema for a fresh database installation.

-- ============================================================
-- Tables (creation order respects foreign-key dependencies)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connected_applications (
    application_id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    provider_email TEXT,
    display_name TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    connection_method TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    credentials_iv TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    context_indexing_enabled INTEGER NOT NULL DEFAULT 1,
    max_context_documents INTEGER,
    last_error_acknowledged_at INTEGER,
    context_last_error_acknowledged_at INTEGER,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (connection_method IN ('oauth2', 'imap-password')),
    CHECK (status IN ('draft', 'connected', 'error'))
);

CREATE TABLE IF NOT EXISTS provider_subscriptions (
    subscription_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL UNIQUE,
    provider_id TEXT,
    external_subscription_id TEXT UNIQUE,
    webhook_secret_hash TEXT,
    client_state_hash TEXT,
    gmail_history_id TEXT,
    resource TEXT,
    status TEXT NOT NULL,
    expires_at INTEGER,
    last_notification_at INTEGER,
    last_renewed_at INTEGER,
    last_error TEXT,
    renewal_retry_count INTEGER NOT NULL DEFAULT 0,
    renewal_next_retry_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    imap_cursor TEXT,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    CHECK (provider_id IS NULL OR provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (status IN ('active', 'stopped', 'error'))
);

CREATE TABLE IF NOT EXISTS processed_messages (
    processed_message_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    status TEXT NOT NULL,
    summary_sent_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    provider_stable_message_fingerprint TEXT,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    UNIQUE (application_id, provider_message_id),
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (status IN ('processing', 'summarized', 'skipped', 'error'))
);

CREATE TABLE IF NOT EXISTS oauth2_authorization_sessions (
    session_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    state_hash TEXT NOT NULL UNIQUE,
    code_verifier TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth2_access_token_refresh_status (
    application_id TEXT PRIMARY KEY,
    access_token_expires_at INTEGER,
    last_refresh_started_at INTEGER,
    last_refresh_succeeded_at INTEGER,
    last_refresh_failed_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_daily_usage (
    usage_date TEXT PRIMARY KEY,
    estimated_neurons INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    embedding_tokens INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS application_watched_folders (
    application_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    folder_name TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (application_id, folder_path),
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_application_configs (
    application_id TEXT NOT NULL,
    config_key TEXT NOT NULL,
    config_value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (application_id, config_key),
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_context_documents (
    context_document_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_provider_id TEXT NOT NULL,
    source_document_id TEXT NOT NULL,
    source_thread_id TEXT,
    vector_namespace TEXT NOT NULL,
    vector_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    indexed_at INTEGER,
    deleted_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    source_document_fingerprint TEXT,
    source_thread_fingerprint TEXT,
    title_fingerprint TEXT,
    sender_fingerprint TEXT,
    content_fingerprint TEXT,
    indexed_text_chars INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    UNIQUE (application_id, source_type, source_document_id),
    CHECK (source_provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (status IN ('active', 'deleted', 'error'))
);

CREATE TABLE IF NOT EXISTS context_audit_logs (
    id TEXT PRIMARY KEY,
    context_document_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    source_document_id TEXT,
    event_type TEXT NOT NULL,
    event_label TEXT,
    event_data TEXT,
    severity TEXT NOT NULL DEFAULT 'info',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (context_document_id) REFERENCES application_context_documents(context_document_id)
);

CREATE TABLE IF NOT EXISTS application_context_deletion_runs (
    deletion_run_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    vector_namespace TEXT NOT NULL,
    requested_vector_count INTEGER NOT NULL,
    deleted_vector_count INTEGER NOT NULL,
    mutation_ids TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    CHECK (status IN ('accepted', 'error'))
);

CREATE TABLE IF NOT EXISTS application_integrations (
    integration_id TEXT NOT NULL PRIMARY KEY,
    application_id TEXT NOT NULL,
    integration_type TEXT NOT NULL,
    name TEXT NOT NULL,
    encrypted_webhook_url TEXT NOT NULL,
    webhook_url_iv TEXT NOT NULL,
    webhook_url_prefix TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_delivery_at INTEGER,
    last_delivery_status TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS integration_delivery_logs (
    log_id TEXT NOT NULL PRIMARY KEY,
    integration_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    status TEXT NOT NULL,
    http_status INTEGER,
    error_message TEXT,
    email_subject TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (integration_id) REFERENCES application_integrations(integration_id) ON DELETE CASCADE,
    CHECK (status IN ('success', 'failure'))
);

CREATE TABLE IF NOT EXISTS email_summary_actions (
    action_id TEXT PRIMARY KEY,
    processed_message_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    encrypted_payload TEXT NOT NULL,
    payload_iv TEXT NOT NULL,
    payload_salt TEXT NOT NULL,
    encrypted_result TEXT,
    result_iv TEXT,
    result_salt TEXT,
    error_message TEXT,
    expires_at INTEGER NOT NULL,
    executed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (processed_message_id) REFERENCES processed_messages(processed_message_id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    CHECK (provider_id IN ('google-gmail', 'microsoft-outlook', 'fastmail-jmap', 'yahoo-mail', 'custom-imap', 'apple-icloud')),
    CHECK (action_type IN (
        'calendar.add_event',
        'email.draft_reply',
        'external.open_link',
        'manual.todo',
        'delivery.track_package',
        'travel.track_flight',
        'finance.pay_bill',
        'appointment.confirm'
    )),
    CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled')),
    CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE TABLE IF NOT EXISTS email_action_executions (
    execution_id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    triggered_by TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_operation_id TEXT,
    request_user_agent_hash TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (action_id) REFERENCES email_summary_actions(action_id) ON DELETE CASCADE,
    CHECK (triggered_by IN ('email_callback', 'web_ui', 'system_expiry', 'auto_execute')),
    CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled'))
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_connected_applications_user_email
    ON connected_applications(user_email);

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_application_id
    ON provider_subscriptions(application_id);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_external_id
    ON provider_subscriptions(external_subscription_id);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_expires_at
    ON provider_subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_renewal
    ON provider_subscriptions(status, expires_at, renewal_next_retry_at);

CREATE INDEX IF NOT EXISTS idx_processed_messages_application_id
    ON processed_messages(application_id);
CREATE INDEX IF NOT EXISTS idx_processed_messages_status
    ON processed_messages(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_messages_stable_fingerprint
    ON processed_messages(application_id, provider_id, provider_stable_message_fingerprint)
    WHERE provider_stable_message_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_processed_messages_app_status_updated
    ON processed_messages(application_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_oauth2_authorization_sessions_application_id
    ON oauth2_authorization_sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_authorization_sessions_expires_at
    ON oauth2_authorization_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth2_sessions_app_state
    ON oauth2_authorization_sessions(application_id, state_hash);

CREATE INDEX IF NOT EXISTS idx_oauth2_access_token_refresh_status_expires_at
    ON oauth2_access_token_refresh_status(access_token_expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth2_access_token_refresh_status_updated_at
    ON oauth2_access_token_refresh_status(updated_at);

CREATE INDEX IF NOT EXISTS idx_application_watched_folders_application
    ON application_watched_folders(application_id);

CREATE INDEX IF NOT EXISTS idx_provider_application_configs_app
    ON provider_application_configs(application_id);

CREATE INDEX IF NOT EXISTS idx_application_context_documents_application_id
    ON application_context_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_application_context_documents_user_email
    ON application_context_documents(user_email);
CREATE INDEX IF NOT EXISTS idx_application_context_documents_status
    ON application_context_documents(status);
CREATE INDEX IF NOT EXISTS idx_application_context_documents_vector_id
    ON application_context_documents(vector_id);
CREATE INDEX IF NOT EXISTS idx_application_context_documents_application_created
    ON application_context_documents(application_id, created_at)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_application_context_documents_user_sort
    ON application_context_documents(user_email, updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_cal_ctx_doc
    ON context_audit_logs(context_document_id, created_at);

CREATE INDEX IF NOT EXISTS idx_application_context_deletion_runs_application_id
    ON application_context_deletion_runs(application_id);
CREATE INDEX IF NOT EXISTS idx_application_context_deletion_runs_user_email
    ON application_context_deletion_runs(user_email);

CREATE INDEX IF NOT EXISTS idx_application_integrations_app_id
    ON application_integrations(application_id);

CREATE INDEX IF NOT EXISTS idx_idl_integration_created
    ON integration_delivery_logs(integration_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idl_created_at
    ON integration_delivery_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_email_summary_actions_user_sort
    ON email_summary_actions(user_email, updated_at, created_at);
CREATE INDEX IF NOT EXISTS idx_email_summary_actions_application_status
    ON email_summary_actions(application_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_email_summary_actions_status_expires
    ON email_summary_actions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_email_summary_actions_processed_message
    ON email_summary_actions(processed_message_id);

CREATE INDEX IF NOT EXISTS idx_email_action_executions_action
    ON email_action_executions(action_id, created_at);

-- Source: 0022_digest_mode.sql
-- Migration 0022: Scheduled Digest Mode
-- Adds synced calendar events table and action external status columns.

CREATE TABLE IF NOT EXISTS synced_calendar_events (
    sync_event_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    provider_event_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    time_zone TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    synced_at INTEGER NOT NULL,
    UNIQUE (application_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_calendar_events_app_start
    ON synced_calendar_events (application_id, start_time);

ALTER TABLE email_summary_actions ADD COLUMN sync_status TEXT;
ALTER TABLE email_summary_actions ADD COLUMN sync_updated_at INTEGER;

-- Source: 0023_background_task_runs.sql
-- Migration 0023: Background Task Run Visibility
-- Adds a unified audit log for all background task executions.

CREATE TABLE IF NOT EXISTS background_task_runs (
    run_id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    application_id TEXT REFERENCES connected_applications(application_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    items_processed INTEGER NOT NULL DEFAULT 0,
    items_failed INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    details TEXT,
    error_message TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    CHECK (status IN ('running', 'success', 'partial_success', 'error', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_btr_app_started
    ON background_task_runs (application_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_btr_type_started
    ON background_task_runs (task_type, started_at DESC);

-- Indexes to support Processing view panels for messages and calendar events
CREATE INDEX IF NOT EXISTS idx_sce_app_synced_at
    ON synced_calendar_events (application_id, synced_at);

CREATE INDEX IF NOT EXISTS idx_pm_app_created
    ON processed_messages (application_id, created_at DESC);

-- Source: 0024_rag_retrieval_toggle.sql
ALTER TABLE connected_applications
  ADD COLUMN rag_retrieval_enabled INTEGER NOT NULL DEFAULT 1;

-- Source: 0025_action_scheduling.sql
-- Add snooze and scheduling support to email_summary_actions.
-- snoozed_until: Unix timestamp. While > now, the action is hidden from the default pending list.
-- scheduled_for: Unix timestamp. When <= now and status = 'pending', background task auto-executes.
ALTER TABLE email_summary_actions ADD COLUMN snoozed_until INTEGER;
ALTER TABLE email_summary_actions ADD COLUMN scheduled_for INTEGER;

CREATE INDEX IF NOT EXISTS idx_email_summary_actions_snoozed_until
  ON email_summary_actions (snoozed_until);
CREATE INDEX IF NOT EXISTS idx_email_summary_actions_scheduled_for
  ON email_summary_actions (status, scheduled_for);

-- Source: 0026_user_language.sql
-- Per-user UI language preference (BCP 47, e.g. en, de, fr, ja, zh-CN).
-- NULL means English (default). Validated/normalized by LocaleUtil in application code.
ALTER TABLE users ADD COLUMN preferred_language TEXT;

-- Source: 0027_action_execution_scheduled_trigger.sql
-- Widen the email_action_executions.triggered_by CHECK to accept 'scheduled'.
--
-- 0021_squash.sql created the column with
--   CHECK (triggered_by IN ('email_callback', 'web_ui', 'system_expiry', 'auto_execute'))
-- but 0025_action_scheduling.sql added the scheduling feature and its
-- EMAIL_ACTION_TRIGGER_SCHEDULED ('scheduled') trigger without updating the
-- constraint. Scheduled auto-execution therefore always failed at the
-- execution-record INSERT: the provider side effect had already succeeded
-- (e.g. a Google Calendar event was created), executeAction caught the CHECK
-- violation and called markFailed, and the user saw a `failed` action with no
-- audit row written.
--
-- SQLite (and therefore D1) has no ALTER TABLE ... DROP CONSTRAINT, so this is
-- a table rebuild. email_action_executions is a leaf table (no other table
-- references it) with a single index, so the rebuild is:
--   1. create the replacement table with the widened CHECK
--   2. copy every row across
--   3. drop the old table
--   4. rename the replacement into place
--   5. recreate the index
-- Ordering matters: every intermediate state is a valid schema, so the
-- migration also succeeds when statements are applied one at a time (which is
-- how the integration test harness applies migrations, and how D1 would behave
-- if a batch were interrupted).

CREATE TABLE IF NOT EXISTS email_action_executions_widened (
    execution_id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    triggered_by TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_operation_id TEXT,
    request_user_agent_hash TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (action_id) REFERENCES email_summary_actions(action_id) ON DELETE CASCADE,
    CHECK (triggered_by IN ('email_callback', 'web_ui', 'system_expiry', 'auto_execute', 'scheduled')),
    CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled'))
);

INSERT INTO email_action_executions_widened (
    execution_id, action_id, attempt, triggered_by, status,
    provider_operation_id, request_user_agent_hash, error_message,
    created_at, completed_at
)
SELECT
    execution_id, action_id, attempt, triggered_by, status,
    provider_operation_id, request_user_agent_hash, error_message,
    created_at, completed_at
FROM email_action_executions;

DROP TABLE email_action_executions;

ALTER TABLE email_action_executions_widened RENAME TO email_action_executions;

CREATE INDEX IF NOT EXISTS idx_email_action_executions_action
    ON email_action_executions(action_id, created_at);

-- Source: 0028_user_identity.sql
-- Migration 0028: Decouple The Email Address From The User Identifier
--
-- `users.email` is the PRIMARY KEY and the identity key of every user-keyed
-- table, so changing an address is not merely unsupported, it is unsafe:
-- `connected_applications`, `application_context_documents` and
-- `application_context_deletion_runs` each carry
-- `FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE`, so
-- rewriting an address either trips the constraint or cascades the user's
-- mailboxes, context documents, and deletion history out of the database.
--
-- ## Why the anchor stays frozen
--
-- The plan was to rebuild those three tables to point at a new `users.id`. That
-- is not possible on D1:
--
--   * D1 honours neither `PRAGMA foreign_keys = off` (a deliberately dangling FK
--     insert is still rejected) nor `PRAGMA legacy_alter_table = on` (children
--     are still repointed on rename).
--   * `PRAGMA defer_foreign_keys = on` is honoured, but per D1's own docs it does
--     not suppress `ON DELETE CASCADE`.
--   * SQLite rewrites a child's FK clause when the parent is renamed, and drops
--     a parent by cascading -- so a referenced table can be dropped without
--     cascade only if nothing points at it, which is exactly what is changing.
--
-- So `users.email` becomes a frozen *anchor*: immutable, still the FK target,
-- and still what legacy `*_email` columns hold. Every new identity column is
-- additive and no existing value has to move.
--
-- ## Why the anchor is also the Vectorize namespace input
--
-- `EmailContextUtil.getUserVectorNamespace` derives the Vectorize namespace as
-- `u_` + sha256(email)[0:62], and that value is persisted in
-- `application_context_documents.vector_namespace` as well as stamped into
-- every vector's `namespace` field. Re-keying the namespace on the new id would
-- orphan every existing vector, so RAG and chat would silently return nothing
-- for every existing user. The anchor is what keeps it stable, which is a
-- second, independent reason it must never be updated.
--
-- ## Deploy order
--
-- Apply this migration BEFORE deploying the code that reads the new columns.
-- Reads that select `user_id` fail with `no such column` on an un-migrated
-- database. Rollback is a code rollback: this migration only adds columns and a
-- table, and the pre-0028 code ignores all of them.
--
-- Rerunnable: every backfill is guarded by `IS NULL` / `INSERT OR IGNORE`, and
-- `users.id` is only filled where it is still missing. The `ADD COLUMN`
-- statements are not guarded -- SQLite has no `IF NOT EXISTS` form for them.

-- ============================================================
-- 1. Stable account key
-- ============================================================
-- SQLite cannot add a PRIMARY KEY column, so the id is a plain column with a
-- unique index. A unique index is a valid foreign key parent, which is all the
-- `user_id` references below need.
--
-- New accounts get their id from `UserDAO.newId()` (WebCrypto) at runtime; this
-- backfill only has to cover the rows that already exist.
ALTER TABLE users ADD COLUMN id TEXT;

UPDATE users SET id = 'usr_' || lower(hex(randomblob(16))) WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- ============================================================
-- 2. Mutable sign-in address
-- ============================================================
-- `users.email` stays the frozen anchor. `current_email` is what the account
-- signs in with, and is the only address column that is ever updated.
ALTER TABLE users ADD COLUMN current_email TEXT;

UPDATE users SET current_email = lower(email) WHERE current_email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_current_email ON users(current_email);

-- ============================================================
-- 3. Address registry
-- ============================================================
-- One row per known address. `is_verified = 1` may authenticate the account;
-- `0` means the account moved off this address and the row is retained only so
-- rows written before the change still resolve to it. A revoked row is
-- re-pointed (not deleted) when a later account legitimately claims the
-- address, so an address is never permanently reserved.
--
-- Keyed on the lowercased address, so a legacy mixed-case anchor still yields
-- exactly one login identity.
CREATE TABLE IF NOT EXISTS user_emails (
    email TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_emails_user_id ON user_emails(user_id);

INSERT OR IGNORE INTO user_emails (email, user_id, is_verified, created_at)
SELECT lower(email), id, 1, created_at FROM users;

-- ============================================================
-- 4. user_id on every user-keyed table
-- ============================================================
-- Additive and nullable: `NULL` means "unknown actor" and keeps resolving via
-- its legacy string column, so no row is orphaned by this migration. The
-- backfill resolves through `user_emails` rather than `users.email` so that a
-- row also resolves once its address is linked as an alias, and `lower()` on
-- both sides makes the join case-insensitive by construction.

-- connected_applications: the ownership key. Every `*ForUser` predicate now
-- matches on this with the frozen `user_email` as the pre-0028 fallback.
ALTER TABLE connected_applications ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE connected_applications SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(connected_applications.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_connected_applications_user_id ON connected_applications(user_id);

-- application_context_documents: carries `vector_namespace`, which is frozen on
-- the anchor for the reason documented in the header.
ALTER TABLE application_context_documents ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE application_context_documents SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(application_context_documents.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_context_documents_user_id ON application_context_documents(user_id);

-- application_context_deletion_runs: retention history for pruned documents.
ALTER TABLE application_context_deletion_runs ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE application_context_deletion_runs SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(application_context_deletion_runs.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_context_deletion_runs_user_id ON application_context_deletion_runs(user_id);

-- email_summary_actions: proposed actions, attributable to an account.
ALTER TABLE email_summary_actions ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE email_summary_actions SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(email_summary_actions.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_summary_actions_user_id ON email_summary_actions(user_id);

-- context_audit_logs: append-only audit trail. The string column is kept
-- verbatim so history reads the same after an address change.
ALTER TABLE context_audit_logs ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE context_audit_logs SET user_id = (
    SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(context_audit_logs.user_email) LIMIT 1
) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_context_audit_logs_user_id ON context_audit_logs(user_id);

-- ============================================================
-- 5. Verify
-- ============================================================
-- `PRAGMA foreign_key_check` reports violations as rows rather than raising, so
-- it is a no-op here and is asserted empty by
-- `test/integration/api/UserIdentityUpgrade.int.test.ts` against a seeded
-- pre-0028 database.
PRAGMA foreign_key_check;

-- Source: 0029_user_username.sql
-- Migration 0029: Add `users.username`
--
-- The kit's canonical `users` table carries a `username` column: a separately
-- mutable public handle, distinct from the frozen `email` anchor and from the
-- mutable `current_email` sign-in address. `@rexezuge/identity`'s `UserDAO`
-- models it and `ensureUsername` / `setUsername` / `getByUsernameCi` read and
-- write it, so adopting those methods needs the column to exist.
--
-- ## What is deliberately NOT here
--
-- This repo keeps `users.preferred_language` (0026). The kit's `UserDAO` does
-- not model it, so `UserDAO` stays a local subclass of the kit's rather than
-- being adopted wholesale — see
-- `packages/backend-data/src/dao/UserDAO.ts`. That is the escape hatch the kit's
-- own migration table describes: a repo whose `users` table has columns the
-- kit's DAO does not model overrides the row instead of forking the kit.
--
-- Nor does this migration touch 0028. D1 cannot drop or retype a column in
-- place, so `id` and `current_email` stay the nullable columns 0028 created and
-- the kit's `USERS_SCHEMA` remains reference-only. Applying the kit's
-- `applyIdentityMigrations` to an already-migrated database would fail on
-- `ALTER TABLE users ADD COLUMN id` (duplicate column) and would leave
-- `username` unmigrated, because its `CREATE TABLE IF NOT EXISTS users` is a
-- silent no-op against an existing table.

ALTER TABLE users ADD COLUMN username TEXT;

-- Nothing to backfill: `username` is a public handle, not an identifier. The
-- kit's `UserDAO.ensureUsername` is the only writer, and it derives the value
-- when a client asks for one. Existing accounts simply have none yet.
--
-- Deliberately NOT unique. The kit indexes it for case-insensitive lookup, but
-- uniqueness is enforced in `setUsername` rather than by the schema, so that
-- swapping two handles in two statements cannot transiently violate a unique
-- index. That is the kit's choice and this column follows it.

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);