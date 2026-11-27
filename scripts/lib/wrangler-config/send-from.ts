import { readConfig } from './patches';
import { TEMPLATE_LABEL } from './types';
import type { WranglerConfig } from './types';

/**
 * `SEND_FROM` is the SMTP envelope sender *and*, after MIME rewriting, the
 * message's `From` header. An empty or malformed value deploys a Worker whose
 * forwarding path fails on every message, so it must fail the deploy rather
 * than a webhook three days later.
 *
 * The template ships an empty placeholder, and the coverage check only proves
 * the key exists. This guard checks the value after `WRANGLER_VARS_PATCH_JSON`
 * has been applied, so a var supplied by a repository variable counts.
 */
const SEND_FROM_PATTERN: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSendFrom(config: WranglerConfig): string {
  const value: unknown = config.vars?.SEND_FROM;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `wrangler.jsonc has no SEND_FROM value. Set it to an address on an onboarded Email Sending domain in ${TEMPLATE_LABEL} or through the WRANGLER_VARS_PATCH_JSON repository variable.`,
    );
  }

  const sender: string = value.trim();
  if (!SEND_FROM_PATTERN.test(sender)) {
    throw new Error(`SEND_FROM must be a single bare email address (received "${sender}").`);
  }
  return sender;
}

export function ensureSendFromConfigured(): void {
  const { config } = readConfig();
  const sender: string = validateSendFrom(config);
  console.log(`SEND_FROM is set to ${sender}.`);
}
