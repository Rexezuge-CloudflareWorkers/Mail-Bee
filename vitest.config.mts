import { defineUnitVitestConfig } from '@rexezuge/tooling/vitest';

/**
 * The unit suite's resolver and coverage floors.
 *
 * This was a hand-written alias table listing every workspace package and every
 * `cloudflare:*` mock by path. `defineUnitVitestConfig` derives both from the
 * package names, so a new workspace package needs no entry here — the failure
 * mode before was an alias silently missing and the suite resolving the
 * *published* package instead of the source, which typechecks and then tests the
 * wrong copy.
 *
 * The coverage floors are the one thing that stays explicit. They are this
 * repo's number, and the factory deliberately sets none by default: a shared
 * default would be a number no repo chose.
 */
export default defineUnitVitestConfig({
  scope: '@mail-bee',
  /**
   * The packages under `packages/`, plus `background`, which the factory
   * resolves to `apps/background/src` because it is an app rather than a
   * package.
   *
   * `api` is absent because `apps/api` is reached through the `@/` alias rather
   * than by package name.
   */
  packages: ['shared', 'backend-data', 'backend-runtime', 'backend-services', 'provider-clients', 'background'],
  mocks: ['workers', 'sockets', 'workflows', 'email'],
  root: new URL('.', import.meta.url).href,
  // The product-critical paths are the ones with behavioural tests. The rest
  // of the inherited framework is typechecked and exercised by integration
  // tests in deployment, and including it here would only report coverage of
  // code Mail-Bee does not call.
  coverageInclude: [
    'packages/backend-services/src/forwarding/**/*.ts',
    'packages/backend-services/src/webhook/{BaseWebhookService,GmailWebhookService}.ts',
    'packages/provider-clients/src/OAuth2Strategy.ts',
  ],
  thresholds: {
    statements: 60,
    branches: 40,
    functions: 60,
    lines: 60,
  },
});
