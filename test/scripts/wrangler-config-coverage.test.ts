import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'jsonc-parser';

/**
 * The template-coverage guard, `ensureConfigCoversTemplate`, and the path
 * normalization `prepareConfigFile` applies when it copies the template.
 *
 * Comparing declared keys instead of a version integer is immune to the class
 * of bug a `$version` guard introduced: a config materialized from the template
 * is byte-identical to it apart from the path rewrite, so it always passes,
 * and an override that has fallen behind still cannot.
 *
 * Everything here runs against a throwaway directory and plain files. No case
 * calls `provisionWranglerResources` or a wrangler subcommand, so the guard is
 * exercised without Cloudflare access.
 *
 * `CONFIG_PATH`/`TEMPLATE_PATH` are computed from `process.cwd()` at import time,
 * so each case runs in a throwaway directory with a fresh module registry.
 */

/**
 * Relative to the repo root, and the only place the shipped template lives.
 */
const SHIPPED_TEMPLATE = 'apps/api/wrangler.template.jsonc';

interface TemplateConfig {
  main?: string;
  assets?: { directory?: string };
  d1_databases?: Array<{ binding?: string; migrations_dir?: string }>;
  kv_namespaces?: Array<{ binding?: string }>;
  queues?: { producers?: Array<{ binding?: string }> };
  durable_objects?: { bindings?: Array<{ name?: string }> };
  migrations?: Array<{ new_sqlite_classes?: string[] }>;
  workflows?: Array<{ binding?: string }>;
  send_email?: Array<{ name?: string }>;
  secrets_store_secrets?: Array<{ binding?: string }>;
  vars?: Record<string, unknown>;
}

describe('wrangler config coverage', () => {
  let workdir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    workdir = mkdtempSync(path.join(tmpdir(), 'wrangler-coverage-'));
    mkdirSync(path.join(workdir, 'apps/api'), { recursive: true });
    delete process.env.WRANGLER_JSONC;
    delete process.env.WRANGLER_PATCH_JSON;
    delete process.env.WRANGLER_VARS_PATCH_JSON;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workdir, { recursive: true, force: true });
    delete process.env.WRANGLER_JSONC;
    delete process.env.WRANGLER_PATCH_JSON;
    delete process.env.WRANGLER_VARS_PATCH_JSON;
    vi.resetModules();
  });

  /**
   * The real shipped template, so a case exercises the file that actually deploys.
   */
  function writeRealTemplate(): void {
    copyFileSync(path.join(originalCwd, SHIPPED_TEMPLATE), path.join(workdir, SHIPPED_TEMPLATE));
  }

  function write(template: string, config: string): void {
    writeFileSync(path.join(workdir, SHIPPED_TEMPLATE), template);
    writeFileSync(path.join(workdir, 'wrangler.jsonc'), config);
  }

  /**
   * A config exercising every field the guard reads, at the smallest useful size.
   *
   * Kept as an object rather than JSON text so a case can drop one key and leave
   * the rest byte-for-byte intact — regex surgery on JSON silently produces a
   * config that fails for the wrong reason, which is how a guard test ends up
   * asserting nothing.
   */
  const FULL_CONFIG = {
    name: 'mail-bee',
    main: 'apps/api/src/index.ts',
    d1_databases: [{ binding: 'DB', database_id: 'x', migrations_dir: './migrations' }],
    kv_namespaces: [{ binding: 'OAUTH2_TOKEN_CACHE', id: 'y' }],
    queues: { producers: [{ queue: 'mail-bee-email-events', binding: 'EMAIL_EVENTS_QUEUE' }] },
    durable_objects: {
      bindings: [
        { name: 'CRON_TASKS', class_name: 'CronTasksWorker' },
        { name: 'OAUTH2_TOKEN_REFRESHERS', class_name: 'OAuth2TokenRefreshWorker' },
      ],
    },
    workflows: [{ binding: 'EMAIL_PROCESSING_WORKFLOW', name: 'mail-bee-email-forwarding', class_name: 'EmailProcessingWorkflow' }],
    send_email: [{ name: 'EMAIL' }],
    migrations: [{ tag: 'v1778260000', new_sqlite_classes: ['CronTasksWorker', 'OAuth2TokenRefreshWorker'] }],
    secrets_store_secrets: [{ binding: 'AES_ENCRYPTION_KEY_SECRET', store_id: 'z', secret_name: 'mail-bee-aes-encryption-key' }],
    vars: { POLICY_AUD: 'aud', TEAM_DOMAIN: 'https://team.example.com', PUBLIC_BASE_URL: '', SEND_FROM: 'mail@example.com' },
  };

  /**
   * Every field the guard reads, each optional at the top level only.
   *
   * Hand-written rather than `Partial<typeof FULL_CONFIG>`, which is shallow and
   * would still reject `config.migrations[0].new_sqlite_classes.filter(...)` and
   * a `vars` literal missing a key — i.e. exactly the edits a case needs to make.
   */
  type ConfigShape = {
    name?: string;
    main?: string;
    assets?: { directory?: string };
    d1_databases?: Array<{ binding: string; database_id: string; migrations_dir?: string }>;
    kv_namespaces?: Array<{ binding: string; id: string }>;
    queues?: { producers: Array<{ queue: string; binding: string }> };
    durable_objects?: { bindings: Array<{ name: string; class_name: string }> };
    workflows?: Array<{ binding: string; name: string; class_name: string }>;
    send_email?: Array<{ name: string }>;
    migrations?: Array<{ tag: string; new_sqlite_classes: string[] }>;
    secrets_store_secrets?: Array<{ binding: string; store_id: string; secret_name?: string }>;
    vars?: Record<string, string>;
  };

  const TEMPLATE = JSON.stringify(FULL_CONFIG, null, 2);

  /**
   * Writes the fixture template with `mutate`'s config as `wrangler.jsonc`.
   */
  function writeWith(mutate: (config: ConfigShape) => ConfigShape): void {
    write(TEMPLATE, JSON.stringify(mutate(structuredClone(FULL_CONFIG)), null, 2));
  }

  async function run(): Promise<void> {
    process.chdir(workdir);
    vi.resetModules();
    const { ensureConfigCoversTemplate } = await import('../../scripts/lib/wrangler-config/template-coverage');
    ensureConfigCoversTemplate();
  }

  /**
   * The guard in its real position: after both patches, before provisioning.
   *
   * `provisionWranglerResources` is deliberately not called — it shells out to
   * wrangler against the live Cloudflare API, which a unit test must not do, and
   * the ordering it would prove (coverage before provisioning) is asserted by the
   * entrypoint's own sequence instead.
   */
  async function runMaterializeSequence(): Promise<void> {
    process.chdir(workdir);
    vi.resetModules();
    const { applyTopLevelPatch, applyVarsPatch, prepareConfigFile } = await import('../../scripts/lib/wrangler-config/patches');
    const { ensureConfigCoversTemplate } = await import('../../scripts/lib/wrangler-config/template-coverage');

    prepareConfigFile();
    applyTopLevelPatch();
    applyVarsPatch();
    ensureConfigCoversTemplate();
  }

  function readMaterializedConfig(): TemplateConfig {
    return parse(readFileSync(path.join(workdir, 'wrangler.jsonc'), 'utf8')) as TemplateConfig;
  }

  it('passes when the config carries every binding and var', async () => {
    write(TEMPLATE, TEMPLATE);
    await expect(run()).resolves.toBeUndefined();
  });

  it('passes for the shipped template copied verbatim', async () => {
    // The case that broke CI in the AWS origin, and the reason the guard is
    // structural: `prepareConfigFile` copies the template when WRANGLER_JSONC is
    // unset, and the guard must accept what it just wrote.
    writeRealTemplate();
    await expect(runMaterializeSequence()).resolves.toBeUndefined();
  });

  it('rewrites the template paths to repo-root-relative ones on the copy', async () => {
    writeRealTemplate();
    await runMaterializeSequence();

    const config = readMaterializedConfig();
    expect(config.main).toBe('apps/api/src/index.ts');
    expect(config.assets?.directory).toBe('./apps/web/dist/');
    expect(config.d1_databases?.map((database) => database.migrations_dir)).toEqual(['./migrations']);
  });

  it('leaves a supplied WRANGLER_JSONC byte-for-byte alone', async () => {
    // The repository variable is already written for a root config. Rewriting
    // it would replace a caller's deliberate paths with template defaults.
    const override = JSON.stringify({ ...FULL_CONFIG, main: 'src/index.ts', assets: { directory: '../../apps/web/dist/' } });
    process.env.WRANGLER_JSONC = override;
    write(TEMPLATE, '');
    await runMaterializeSequence();

    expect(readFileSync(path.join(workdir, 'wrangler.jsonc'), 'utf8')).toBe(`${override}\n`);
  });

  it('accepts a var supplied by the vars patch, because coverage runs after it', async () => {
    // The documented route for a fork that does not carry the whole file. If the
    // check moved ahead of `applyVarsPatch`, this legitimate config would fail.
    writeWith((config) => ({ ...config, vars: { POLICY_AUD: 'aud', TEAM_DOMAIN: 'https://team.example.com', PUBLIC_BASE_URL: '' } }));
    process.env.WRANGLER_VARS_PATCH_JSON = JSON.stringify({ SEND_FROM: 'mail@example.com' });

    await expect(runMaterializeSequence()).resolves.toBeUndefined();
  });

  it('fails when the D1 binding is missing', async () => {
    // No binding the worker reads means every request fails on the missing env.
    writeWith((config) => ({ ...config, d1_databases: [] }));
    await expect(run()).rejects.toThrow(/d1_databases\[\]\.binding: DB/);
  });

  it('fails when the token-cache KV binding is missing', async () => {
    // The template already declares it and nothing injects it at deploy time.
    writeWith((config) => ({ ...config, kv_namespaces: [] }));
    await expect(run()).rejects.toThrow(/kv_namespaces\[\]\.binding: OAUTH2_TOKEN_CACHE/);
  });

  it('fails when the queue producer binding is missing', async () => {
    writeWith((config) => ({ ...config, queues: { producers: [] } }));
    await expect(run()).rejects.toThrow(/queues\.producers\[\]\.binding: EMAIL_EVENTS_QUEUE/);
  });

  it('fails when a Durable Object binding is missing', async () => {
    // Nothing heals this one: a worker without `OAUTH2_TOKEN_REFRESHERS` has no
    // serialized token refresh at all.
    writeWith((config) => {
      config.durable_objects = { bindings: (config.durable_objects?.bindings ?? []).filter((binding) => binding.name === 'CRON_TASKS') };
      return config;
    });
    await expect(run()).rejects.toThrow(/durable_objects\.bindings\[\]\.name: OAUTH2_TOKEN_REFRESHERS/);
  });

  it('fails when the workflow binding is missing', async () => {
    writeWith((config) => ({ ...config, workflows: [] }));
    await expect(run()).rejects.toThrow(/workflows\[\]\.binding: EMAIL_PROCESSING_WORKFLOW/);
  });

  it('fails when the email send binding is missing', async () => {
    writeWith((config) => ({ ...config, send_email: [] }));
    await expect(run()).rejects.toThrow(/send_email\[\]\.name: EMAIL/);
  });

  it('fails when the migration omits a Durable Object class', async () => {
    writeWith((config) => ({ ...config, migrations: [{ tag: 'v1778260000', new_sqlite_classes: [] }] }));
    await expect(run()).rejects.toThrow(/migrations\[\]\.new_sqlite_classes: CronTasksWorker, OAuth2TokenRefreshWorker/);
  });

  it('fails when the AES key binding is missing', async () => {
    // Credentials and OAuth tokens cannot be read without it.
    writeWith((config) => ({ ...config, secrets_store_secrets: [] }));
    await expect(run()).rejects.toThrow(/secrets_store_secrets\[\]\.binding: AES_ENCRYPTION_KEY_SECRET/);
  });

  it('fails when a var is missing, and points at the patch variable', async () => {
    writeWith((config) => ({ ...config, vars: { POLICY_AUD: 'aud', TEAM_DOMAIN: 'https://team.example.com' } }));
    await expect(run()).rejects.toThrow(/vars: PUBLIC_BASE_URL, SEND_FROM[\s\S]*WRANGLER_VARS_PATCH_JSON/);
  });

  it('compares presence, not values', async () => {
    // A deployment fills these with its own real Access values through
    // WRANGLER_VARS_PATCH_JSON; an equality check would fail every override.
    writeWith((config) => ({ ...config, vars: { ...config.vars, TEAM_DOMAIN: 'https://staging.example.com', SEND_FROM: '' } }));
    await expect(run()).resolves.toBeUndefined();
  });

  it('reports every gap at once rather than the first', async () => {
    // One run must name the whole resync, not make the reader fix it one deploy
    // at a time.
    write(TEMPLATE, '{ "name": "mail-bee" }');
    await expect(run()).rejects.toThrow(/DB[\s\S]*OAUTH2_TOKEN_CACHE[\s\S]*EMAIL_EVENTS_QUEUE[\s\S]*CRON_TASKS[\s\S]*AES_ENCRYPTION_KEY_SECRET[\s\S]*POLICY_AUD/);
  });

  it('names the fix, so the failure is actionable', async () => {
    write(TEMPLATE, '{ "name": "mail-bee" }');
    await expect(run()).rejects.toThrow(/Regenerate it from apps\/api\/wrangler\.template\.jsonc/);
  });

  it('finds no gaps between a template and an identical config', async () => {
    process.chdir(workdir);
    vi.resetModules();
    const { findCoverageGaps } = await import('../../scripts/lib/wrangler-config/template-coverage');
    const config = parse(TEMPLATE) as Parameters<typeof findCoverageGaps>[0];

    expect(findCoverageGaps(config, structuredClone(config))).toEqual([]);
  });

  it('reports gaps by field without mutating either input', async () => {
    process.chdir(workdir);
    vi.resetModules();
    const { findCoverageGaps } = await import('../../scripts/lib/wrangler-config/template-coverage');
    const template = parse(TEMPLATE) as Parameters<typeof findCoverageGaps>[0];
    const config = parse(JSON.stringify({ name: 'mail-bee', vars: { POLICY_AUD: 'aud' } })) as Parameters<typeof findCoverageGaps>[1];
    const before = structuredClone(config);

    const gaps = findCoverageGaps(template, config);

    expect(gaps.map((gap) => gap.field)).toContain('kv_namespaces[].binding');
    expect(gaps.find((gap) => gap.field === 'vars')?.missing).toContain('SEND_FROM');
    expect(config).toEqual(before);
  });

  it('normalizes template paths as a pure, idempotent rewrite that keeps comments', async () => {
    vi.resetModules();
    const { normalizeTemplatePaths } = await import('../../scripts/lib/wrangler-config/patches');
    const content = [
      '{',
      '  // app-relative paths for wrangler --config ./apps/api/wrangler.template.jsonc',
      '  "main": "src/index.ts",',
      '  "assets": { "directory": "../../apps/web/dist/" },',
      '  "d1_databases": [',
      '    { "migrations_dir": "../../migrations" },',
      '    { "migrations_dir": "../../migrations" },',
      '  ],',
      '}',
    ].join('\n');

    const normalized = normalizeTemplatePaths(content);
    const parsed = parse(normalized) as TemplateConfig;

    expect(parsed.main).toBe('apps/api/src/index.ts');
    expect(parsed.assets?.directory).toBe('./apps/web/dist/');
    expect(parsed.d1_databases?.map((database) => database.migrations_dir)).toEqual(['./migrations', './migrations']);
    expect(normalized).toContain('// app-relative paths');
    expect(normalizeTemplatePaths(normalized)).toBe(normalized);
  });

  it('the shipped template declares no custom version keys', async () => {
    // `$version`/`$minimumVersion` are not in wrangler's schema — it flags them
    // and suggests an upgrade — so they stay commented. Un-commenting them would
    // revive a dead mechanism.
    const template = parse(readFileSync(path.join(originalCwd, SHIPPED_TEMPLATE), 'utf8')) as {
      $version?: unknown;
      $minimumVersion?: unknown;
    };

    expect(template.$version).toBeUndefined();
    expect(template.$minimumVersion).toBeUndefined();
  });

  it('the shipped template declares every binding the guard requires', async () => {
    // The guard is only meaningful while the template still declares the things
    // it compares. An empty list would silently stop checking that binding.
    const template = parse(readFileSync(path.join(originalCwd, SHIPPED_TEMPLATE), 'utf8')) as TemplateConfig;

    expect(template.d1_databases?.map((database) => database.binding)).toContain('DB');
    expect(template.kv_namespaces?.map((namespace) => namespace.binding)).toContain('OAUTH2_TOKEN_CACHE');
    expect(template.queues?.producers?.map((producer) => producer.binding)).toContain('EMAIL_EVENTS_QUEUE');
    expect(template.durable_objects?.bindings?.map((binding) => binding.name)).toEqual(
      expect.arrayContaining(['CRON_TASKS', 'OAUTH2_TOKEN_REFRESHERS']),
    );
    expect(template.workflows?.map((workflow) => workflow.binding)).toContain('EMAIL_PROCESSING_WORKFLOW');
    expect(template.send_email?.map((sender) => sender.name)).toContain('EMAIL');
    expect(template.secrets_store_secrets?.map((secret) => secret.binding)).toContain('AES_ENCRYPTION_KEY_SECRET');
    expect(template.migrations?.[0]?.new_sqlite_classes).toEqual(['CronTasksWorker', 'OAuth2TokenRefreshWorker']);
    expect(Object.keys(template.vars ?? {})).toEqual(
      expect.arrayContaining([
        'POLICY_AUD',
        'TEAM_DOMAIN',
        'PUBLIC_BASE_URL',
        'SEND_FROM',
        'GMAIL_WATCH_RENEWAL_WINDOW_HOURS',
        'OUTLOOK_SUBSCRIPTION_RENEWAL_WINDOW_HOURS',
        'OUTLOOK_SUBSCRIPTION_TTL_DAYS',
        'OAUTH2_ACCESS_TOKEN_REFRESH_WINDOW_SECONDS',
        'OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS',
        'OAUTH2_ACCESS_TOKEN_FALLBACK_TTL_SECONDS',
        'OAUTH2_TOKEN_REFRESH_BATCH_SIZE',
      ]),
    );
  });
});
