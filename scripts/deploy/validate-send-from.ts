#!/usr/bin/env tsx

/**
 * Deploy-only guard: a materialized config must carry a real `SEND_FROM`.
 *
 * Kept out of `prepare-wrangler-config.ts` because the backup workflow uses that
 * script too: an unconfigured sender should stop a deploy, not a database
 * backup.
 */
import { ensureSendFromConfigured } from '../lib/wrangler-config/send-from';

ensureSendFromConfigured();
