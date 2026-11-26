import { ApplicationContextDAO } from '@mail-bee/backend-data/dao';
import { computeUnixCutoffSeconds, createD1SessionEnv, pruneInBatches } from '@mail-bee/backend-data/utils';
import { ConfigurationManager } from '@mail-bee/backend-runtime/config';
import { IScheduledTask } from './IScheduledTask';
import type { IEnv } from './IScheduledTask';

class ContextDeletionRunPruningTask extends IScheduledTask<ContextDeletionRunPruningTaskEnv> {
  protected async handleScheduledTask(
    _event: ScheduledController,
    env: ContextDeletionRunPruningTaskEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const retentionDays: number = ConfigurationManager.getContextDeletionRunRetentionDays(env);
    const olderThan: number = computeUnixCutoffSeconds(retentionDays);
    const sessionEnv = createD1SessionEnv(env);
    const dao = new ApplicationContextDAO(sessionEnv.DB);

    const total = await pruneInBatches((batchSize) => dao.deleteOldDeletionRuns(olderThan, batchSize));
    console.log(`ContextDeletionRunPruningTask: deleted ${total} old deletion runs`);
  }
}

interface ContextDeletionRunPruningTaskEnv extends IEnv {
  DB: D1Database;
  CONTEXT_DELETION_RUN_RETENTION_DAYS?: string;
}

export { ContextDeletionRunPruningTask };
