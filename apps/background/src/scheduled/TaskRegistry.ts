import { TaskRegistry as SdkTaskRegistry } from '@rexezuge/runtime';
import type { AbstractScheduledTask } from '@rexezuge/runtime';
import { OAuth2AccessTokenRefreshTask } from './OAuth2AccessTokenRefreshTask';
import { OAuth2SessionPruningTask } from './OAuth2SessionPruningTask';
import { ProcessedMessagePruningTask } from './ProcessedMessagePruningTask';
import { SubscriptionRenewalTask } from './SubscriptionRenewalTask';

type CronPhase = 1 | 2;

interface TaskDefinition {
  phase: CronPhase;
  make: () => AbstractScheduledTask;
}

/**
 * Mail-Bee's cron surface is deliberately small: keep OAuth tokens and mailbox
 * subscriptions alive, and prune the forwarding log. Everything else in the
 * Mail-Otter task registry was AI, actions, integrations or IMAP polling.
 */
const CRON_TASK_DEFINITIONS: readonly TaskDefinition[] = [
  { phase: 1, make: () => new OAuth2AccessTokenRefreshTask() },
  { phase: 1, make: () => new SubscriptionRenewalTask() },
  { phase: 2, make: () => new OAuth2SessionPruningTask() },
  { phase: 2, make: () => new ProcessedMessagePruningTask() },
];

/**
 * Build a fresh registry per phase lookup: a task holds its active DB only for
 * one invocation, and the Durable Object can receive several cron requests.
 */
function tasksForPhase(phase: CronPhase): readonly AbstractScheduledTask[] {
  const registry = new SdkTaskRegistry();
  for (const definition of CRON_TASK_DEFINITIONS) {
    if (definition.phase === phase) registry.register(definition.phase, definition.make());
  }
  return registry.tasksForPhase(phase);
}

export { CRON_TASK_DEFINITIONS, tasksForPhase };
export type { CronPhase, TaskDefinition };
