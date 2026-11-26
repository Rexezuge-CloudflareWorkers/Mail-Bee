#!/usr/bin/env node
/**
 * Drop the main-module type inference from `wrangler types` output.
 *
 * The deploy config resolves `main` relative to its own directory, so the
 * generated file can see the Worker entrypoint and inlines
 * `import("./apps/api/src/index")` into the DO and Workflow bindings. Every
 * workspace tsconfig includes the generated file, so that one import drags the
 * entire backend program into each package's typecheck (with that package's,
 * not the api's, path aliases). Mail-Bee does not use ctx.exports or typed DO
 * stubs; plain binding types are both sufficient and much cheaper.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const path = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'worker-configuration.d.ts');
const original = readFileSync(path, 'utf8');
const cleaned = original
  .replaceAll('DurableObjectNamespace<import("./apps/api/src/index").CronTasksWorker>', 'DurableObjectNamespace')
  .replaceAll('DurableObjectNamespace<import("./apps/api/src/index").OAuth2TokenRefreshWorker>', 'DurableObjectNamespace')
  .replaceAll("Workflow<Parameters<import(\"./apps/api/src/index\").EmailProcessingWorkflow['run']>[0]['payload']>", 'Workflow')
  .replaceAll('mainModule: typeof import("./apps/api/src/index");', 'mainModule: string;');

if (cleaned !== original) {
  writeFileSync(path, cleaned);
  console.log('postprocess-types: removed main-module inference from generated bindings');
}
