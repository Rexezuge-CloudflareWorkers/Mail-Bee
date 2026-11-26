import { OAuth2AccessTokenRefreshTask } from './OAuth2AccessTokenRefreshTask';
import { OAuth2SessionPruningTask } from './OAuth2SessionPruningTask';
import { ProcessedMessagePruningTask } from './ProcessedMessagePruningTask';
import { SubscriptionRenewalTask } from './SubscriptionRenewalTask';
import type { IEnv, IScheduledTask } from './IScheduledTask';

type CronPhase = 1 | 2;

interface TaskDefinition {
  phase: CronPhase;
  make: () => IScheduledTask<IEnv>;
}

/**
 * Mail-Bee's cron surface is deliberately small: keep OAuth tokens and mailbox
 * subscriptions alive, and prune the forwarding log. Everything else in the
 * Mail-Bee task registry was AI, actions, integrations or IMAP polling.
 */
const CRON_TASK_DEFINITIONS: readonly TaskDefinition[] = [
  { phase: 1, make: () => new OAuth2AccessTokenRefreshTask() },
  { phase: 1, make: () => new SubscriptionRenewalTask() },
  { phase: 2, make: () => new OAuth2SessionPruningTask() },
  { phase: 2, make: () => new ProcessedMessagePruningTask() },
];

function tasksForPhase(phase: CronPhase): IScheduledTask<IEnv>[] {
  return CRON_TASK_DEFINITIONS.filter((definition: TaskDefinition): boolean => definition.phase === phase).map(
    (definition: TaskDefinition): IScheduledTask<IEnv> => definition.make(),
  );
}

export { CRON_TASK_DEFINITIONS, tasksForPhase };
export type { CronPhase, TaskDefinition };
