import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { readConfig } from './patches';
import { TEMPLATE_LABEL, TEMPLATE_PATH, type WranglerConfig } from './types';

/**
 * One template requirement the materialized config failed to meet.
 */
export interface CoverageGap {
  /**
   * The config field the key lives in, so the error names where to look.
   */
  field: string;
  /**
   * The keys `wrangler.jsonc` does not carry.
   */
  missing: string[];
}

/**
 * Reads `apps/api/wrangler.template.jsonc` as a parsed object.
 */
function readTemplate(): WranglerConfig {
  return parse(readFileSync(TEMPLATE_PATH, 'utf8')) as WranglerConfig;
}

/**
 * Every binding name, Durable Object class and var a config declares, grouped
 * by the field each lives in.
 *
 * One table for both sides of the comparison, because two copies of this list
 * would drift and a key present on only one side reads as a permanent false gap.
 * Presence is all that is ever compared, never the value: a deployment fills
 * `POLICY_AUD`, `TEAM_DOMAIN`, `PUBLIC_BASE_URL` and `SEND_FROM` with its own
 * real values through `WRANGLER_VARS_PATCH_JSON`, so an equality check would
 * fail every legitimate override.
 *
 * Every section Mail-Bee's worker reads is here. Nothing injects a missing
 * binding at deploy time: a config without `EMAIL_EVENTS_QUEUE`,
 * `EMAIL_PROCESSING_WORKFLOW`, `EMAIL`, or either Durable Object deploys a
 * worker whose forwarding path is silently dead. The migration's
 * `new_sqlite_classes` are included because binding a DO without migrating its
 * class produces the same broken worker.
 */
function collectKeys(config: WranglerConfig): Map<string, string[]> {
  const durableObjectBindings = (config.durable_objects?.bindings ?? []).map((binding) => binding.name);
  const migrationClasses = (config.migrations ?? []).flatMap((migration) => migration.new_sqlite_classes ?? []);
  const fields: Array<[string, Array<string | undefined>]> = [
    ['d1_databases[].binding', (config.d1_databases ?? []).map((database) => database.binding)],
    ['kv_namespaces[].binding', (config.kv_namespaces ?? []).map((namespace) => namespace.binding)],
    ['queues.producers[].binding', (config.queues?.producers ?? []).map((producer) => producer.binding)],
    ['durable_objects.bindings[].name', durableObjectBindings],
    ['workflows[].binding', (config.workflows ?? []).map((workflow) => workflow.binding)],
    ['send_email[].name', (config.send_email ?? []).map((sender) => sender.name)],
    ['migrations[].new_sqlite_classes', migrationClasses],
    ['services[].binding', (config.services ?? []).map((service) => service.binding)],
    ['secrets_store_secrets[].binding', (config.secrets_store_secrets ?? []).map((secret) => secret.binding)],
    ['vars', Object.keys(config.vars ?? {})],
  ];

  return new Map(fields.map(([field, keys]) => [field, keys.filter((key): key is string => typeof key === 'string')]));
}

/**
 * Reports every template binding, class or var the config does not carry.
 *
 * All gaps are returned rather than throwing on the first, so one run names the
 * whole resync instead of making the reader fix them one deploy at a time.
 */
export function findCoverageGaps(template: WranglerConfig, config: WranglerConfig): CoverageGap[] {
  const present = collectKeys(config);

  return [...collectKeys(template)].flatMap(([field, keys]) => {
    const carried = new Set(present.get(field));
    const missing = keys.filter((key) => !carried.has(key));
    return missing.length > 0 ? [{ field, missing }] : [];
  });
}

/**
 * Refuses to deploy a config that omits something the current worker needs.
 *
 * A `WRANGLER_JSONC` override outlives the template it was copied from, so a
 * fork that added a binding or a var can carry a config that never gained it.
 * Failing here names the fix instead of letting the deploy fail later against a
 * live environment — a missing `AES_ENCRYPTION_KEY_SECRET` breaks every
 * credential read, and a missing `SEND_FROM` leaves forwarding without an
 * onboarded sender domain.
 *
 * This replaces a `$version`/`$minimumVersion` integer guard. Those keys are not
 * in wrangler's schema, and reading them with `jsonc-parser` rather than `grep`
 * made an inert template comment fatal: a config copied straight from the
 * template carries no `$version`, so the copy path could not deploy at all. A
 * config materialized from the template is byte-identical to it (apart from
 * root-relative path normalization), so it always passes here, and an override
 * that has fallen behind cannot.
 */
export function ensureConfigCoversTemplate(): void {
  const template = readTemplate();
  const { config } = readConfig();
  const gaps = findCoverageGaps(template, config);

  if (gaps.length === 0) {
    console.log('wrangler.jsonc carries every binding and var the template requires.');
    return;
  }

  const detail = gaps.map((gap) => `  - ${gap.field}: ${gap.missing.join(', ')}`).join('\n');
  const hasVarGap = gaps.some((gap) => gap.field === 'vars');
  const varHint = hasVarGap
    ? ' Vars can also be supplied without replacing the whole file, via the WRANGLER_VARS_PATCH_JSON repository variable.'
    : '';
  throw new Error(
    `wrangler.jsonc is missing bindings and vars that ${TEMPLATE_LABEL} requires:\n${detail}\nRegenerate it from ${TEMPLATE_LABEL}.${varHint}`,
  );
}
