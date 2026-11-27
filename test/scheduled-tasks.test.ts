import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartRun, mockSucceedRun, mockFailRun, mockSkipRun } = vi.hoisted(() => ({
  mockStartRun: vi.fn(),
  mockSucceedRun: vi.fn(),
  mockFailRun: vi.fn(),
  mockSkipRun: vi.fn(),
}));

vi.mock('@mail-bee/backend-data/dao', () => ({
  BackgroundTaskRunDAO: vi.fn(function () {
    return { startRun: mockStartRun, succeedRun: mockSucceedRun, failRun: mockFailRun, skipRun: mockSkipRun };
  }),
}));

import { MailBeeScheduledTask } from '@mail-bee/background/scheduled/MailBeeScheduledTask';
import { tasksForPhase } from '@mail-bee/background/scheduled/TaskRegistry';
import type { ScheduledControllerLike, ExecutionContextLike, TaskRunSummary } from '@rexezuge/runtime';

const event: ScheduledControllerLike = { cron: '* * * * *', scheduledTime: 0, noRetry: () => {} };
const ctx: ExecutionContextLike = { waitUntil: () => {}, passThroughOnException: () => {} };

class ExampleTask extends MailBeeScheduledTask<{ DB: D1Queryable }> {
  protected override getTaskType(): string {
    return 'example';
  }

  protected async handleScheduledTask(): Promise<TaskRunSummary> {
    return { itemsProcessed: 2, itemsFailed: 0 };
  }
}

class FailingTask extends ExampleTask {
  protected override async handleScheduledTask(): Promise<TaskRunSummary> {
    throw new Error('Authorization: Bearer super-secret-token');
  }
}

describe('scheduled task SDK adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartRun.mockResolvedValue('run-1');
    mockSucceedRun.mockResolvedValue(null);
    mockFailRun.mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('binds the run recorder to the DB passed with the cron event', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Queryable;
    await new ExampleTask().handle(event, { DB: db }, ctx);

    expect(mockStartRun).toHaveBeenCalledWith({ taskType: 'example' });
    expect(mockSucceedRun).toHaveBeenCalledWith('run-1', { itemsProcessed: 2, itemsFailed: 0 });
  });

  it('records a redacted failure and swallows it so the cron batch is not retried', async () => {
    await expect(new FailingTask().handle(event, { DB: {} as D1Queryable }, ctx)).resolves.toBeUndefined();

    expect(mockFailRun).toHaveBeenCalledTimes(1);
    expect(mockFailRun.mock.calls[0][1]).not.toContain('super-secret-token');
    expect(mockFailRun.mock.calls[0][1]).toContain('[REDACTED]');
    expect(console.error).toHaveBeenCalled();
    expect(mockSucceedRun).not.toHaveBeenCalled();
  });

  it('still runs the task when starting the run record fails', async () => {
    mockStartRun.mockRejectedValue(new Error('D1 unavailable'));
    await new ExampleTask().handle(event, { DB: {} as D1Queryable }, ctx);

    expect(console.warn).toHaveBeenCalled();
    expect(mockSucceedRun).not.toHaveBeenCalled();
  });
});

describe('cron task registry', () => {
  it('registers only Mail-Bee tasks, split into the two cron phases', () => {
    expect(tasksForPhase(1).map((task) => task.constructor.name)).toEqual(['OAuth2AccessTokenRefreshTask', 'SubscriptionRenewalTask']);
    expect(tasksForPhase(2).map((task) => task.constructor.name)).toEqual(['OAuth2SessionPruningTask', 'ProcessedMessagePruningTask']);
    expect(tasksForPhase(3)).toEqual([]);
  });

  it('creates fresh task instances for each invocation', () => {
    const first = tasksForPhase(1);
    const second = tasksForPhase(1);
    expect(first[0]).not.toBe(second[0]);
  });
});
