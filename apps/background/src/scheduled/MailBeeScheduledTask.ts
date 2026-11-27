import { BackgroundTaskRunDAO } from '@mail-bee/backend-data/dao';
import type { D1Queryable } from '@mail-bee/backend-data/utils';
import { ErrorSanitizationUtil, logTokenAdjacentError } from '@mail-bee/shared/utils';
import { AbstractScheduledTask } from '@rexezuge/runtime';
import type { ExecutionContextLike, ScheduledControllerLike, TaskLogger, TaskRunRecorder } from '@rexezuge/runtime';
export type { TaskRunSummary } from '@rexezuge/runtime';

/**
 * The SDK's Template Method, bound to Mail-Bee's run-record DAO and its
 * token-adjacent logging rules.
 *
 * The kit cannot import a consumer's DAO or redactor without inverting its
 * package graph, so this subclass supplies those four seams once. Tasks then
 * implement only `handleScheduledTask`, and the kit owns the run record, the
 * catch and the error ordering.
 */
abstract class MailBeeScheduledTask<TEnv extends TaskEnv> extends AbstractScheduledTask<TEnv> {
  private activeDb: D1Queryable | undefined;

  /**
   * The kit's recorder factory takes no arguments, because the kit cannot know
   * what a consumer's env looks like. Capture the DB for the duration of the
   * invocation so the factory can bind the DAO without making every task hold
   * a binding in its constructor.
   */
  public override async handle(event: ScheduledControllerLike, env: TEnv, ctx: ExecutionContextLike): Promise<void> {
    this.activeDb = env.DB;
    try {
      await super.handle(event, env, ctx);
    } finally {
      this.activeDb = undefined;
    }
  }

  protected override createRunRecorder(): TaskRunRecorder | null {
    if (!this.activeDb) return null;
    return new BackgroundTaskRunDAO(this.activeDb);
  }

  protected override logger(): TaskLogger {
    return (level: 'warn' | 'error', message: string): void => {
      logTokenAdjacentError(level, message);
    };
  }

  /**
   * Run records are user-visible: an OAuth error message can carry a bearer
   * token, so the SDK's default (the raw error message) must be replaced.
   */
  protected override describeFailure(error: unknown): string {
    return ErrorSanitizationUtil.sanitizeErrorForLogging(error);
  }

  /**
   * The cron Durable Object reports a failed batch itself. Rethrowing per task
   * would retry the whole batch with `Promise.all`, duplicating work that had
   * already succeeded.
   */
  protected override swallowErrors(): boolean {
    return true;
  }
}

interface TaskEnv {
  DB: D1Queryable;
}

export { MailBeeScheduledTask };
export type { TaskEnv };
