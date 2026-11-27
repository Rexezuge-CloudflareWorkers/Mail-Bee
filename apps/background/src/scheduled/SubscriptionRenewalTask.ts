import { createD1SessionEnv } from '@mail-bee/backend-data/utils';
import { SubscriptionRenewalUtil } from '@mail-bee/backend-services/subscription';
import { MailBeeScheduledTask } from './MailBeeScheduledTask';
import type { TaskEnv, TaskRunSummary } from './MailBeeScheduledTask';

// Adapter making SubscriptionRenewalUtil a first-class scheduled task so
// CronTasksWorker phases stay uniform (Composite pattern).
class SubscriptionRenewalTask extends MailBeeScheduledTask<SubscriptionRenewalTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: SubscriptionRenewalTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<TaskRunSummary> {
    await new SubscriptionRenewalUtil(createD1SessionEnv(env)).renewDueSubscriptions();
    return { itemsProcessed: 1, itemsFailed: 0, summary: 'Subscription renewal sweep completed' };
  }
}

interface SubscriptionRenewalTaskEnv extends TaskEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
}

export { SubscriptionRenewalTask };
