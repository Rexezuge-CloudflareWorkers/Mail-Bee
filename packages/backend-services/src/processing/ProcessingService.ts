import { ProcessedMessageDAO } from '@mail-bee/backend-data/dao';
import type { ListProcessedMessagesOptions } from '@mail-bee/backend-data/dao';
import type { UserScope } from '@mail-bee/backend-data/dao';
import type { D1Queryable } from '@mail-bee/backend-data/utils';
import type { ProcessedMessageList } from '@mail-bee/shared/model';

interface ProcessingServiceEnv {
  DB: D1Queryable;
}

interface ProcessingServiceDeps {
  processedMessageDAO?: () => Promise<ProcessedMessageDAO>;
}

/**
 * The forwarding log read used by `/user/application/messages`.
 *
 * Mail-Otter's task-run and calendar-event views and its manual task triggers
 * had no Mail-Bee route or cron registration, so they were removed with their
 * digest/action dependencies rather than retained as unreachable API surface.
 */
class ProcessingService {
  private readonly deps: Required<ProcessingServiceDeps>;

  constructor(
    private readonly env: ProcessingServiceEnv,
    deps: ProcessingServiceDeps = {},
  ) {
    const db = env.DB;
    this.deps = {
      processedMessageDAO: deps.processedMessageDAO ?? (() => Promise.resolve(new ProcessedMessageDAO(db))),
    };
  }

  public static async listProcessedMessages(
    scope: UserScope,
    options: Pick<ListProcessedMessagesOptions, 'applicationId' | 'status' | 'cursor'>,
    env: ProcessingServiceEnv,
  ): Promise<ProcessedMessageList> {
    return new ProcessingService(env).listProcessedMessages(scope, options);
  }

  public async listProcessedMessages(
    scope: UserScope,
    options: Pick<ListProcessedMessagesOptions, 'applicationId' | 'status' | 'cursor'>,
  ): Promise<ProcessedMessageList> {
    const dao = await this.deps.processedMessageDAO();
    return dao.listForUser(scope, {
      applicationId: options.applicationId,
      status: options.status,
      cursor: options.cursor,
    });
  }
}

export { ProcessingService };
export type { ProcessingServiceDeps, ProcessingServiceEnv };
