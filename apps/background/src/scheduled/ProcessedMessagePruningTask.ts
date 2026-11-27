import { PROCESSED_MESSAGE_STATUS_SKIPPED, PROCESSED_MESSAGE_STATUS_SUMMARIZED } from '@mail-bee/shared/constants';
import { ProcessedMessageDAO } from '@mail-bee/backend-data/dao';
import type { D1Queryable } from '@mail-bee/backend-data/utils';
import { ConfigurationManager } from '@mail-bee/backend-runtime/config';
import { AbstractPruningTask } from './AbstractPruningTask';
import type { TaskEnv } from './MailBeeScheduledTask';

class ProcessedMessagePruningTask extends AbstractPruningTask<ProcessedMessagePruningTaskEnv> {
  protected getRetentionDays(env: ProcessedMessagePruningTaskEnv): number {
    return ConfigurationManager.getProcessedMessageRetentionDays(env);
  }

  protected pruneBatch(_env: ProcessedMessagePruningTaskEnv, db: D1Queryable, cutoff: number, batchSize: number): Promise<number> {
    return new ProcessedMessageDAO(db).deleteOlderThan(
      cutoff,
      [PROCESSED_MESSAGE_STATUS_SUMMARIZED, PROCESSED_MESSAGE_STATUS_SKIPPED],
      batchSize,
    );
  }
}

interface ProcessedMessagePruningTaskEnv extends TaskEnv {
  DB: D1Database;
  PROCESSED_MESSAGE_RETENTION_DAYS?: string;
}

export { ProcessedMessagePruningTask };
