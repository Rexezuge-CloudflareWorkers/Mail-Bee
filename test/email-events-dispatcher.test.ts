import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailEventsDispatcherWorker } from '@mail-bee/background/EmailEventsDispatcherWorker';

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function makeMessage(id: string) {
  return { id, body: { type: 'outlook-notification', applicationId: 'app-1', messageId: 'message-1' }, ack: vi.fn(), retry: vi.fn() };
}

function makeBatch(messages: ReturnType<typeof makeMessage>[]) {
  return { queue: 'email-events', messages } as unknown as MessageBatch<never>;
}

function makeEnv(createBatch: ReturnType<typeof vi.fn>, create = vi.fn()) {
  return { EMAIL_PROCESSING_WORKFLOW: { createBatch, create } } as unknown as Env;
}

describe('EmailEventsDispatcherWorker', () => {
  const worker = new EmailEventsDispatcherWorker();

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('acks the whole batch when the workflow batch is created', async () => {
    const messages = [makeMessage('m1'), makeMessage('m2')];
    const createBatch = vi.fn().mockResolvedValue(undefined);

    await worker.queue(makeBatch(messages), makeEnv(createBatch), ctx);

    expect(createBatch).toHaveBeenCalledTimes(1);
    for (const message of messages) {
      expect(message.ack).toHaveBeenCalledTimes(1);
      expect(message.retry).not.toHaveBeenCalled();
    }
  });

  it('uses a deterministic instance id derived from the queue and message id', async () => {
    const createBatch = vi.fn().mockResolvedValue(undefined);
    await worker.queue(makeBatch([makeMessage('m1')]), makeEnv(createBatch), ctx);
    const firstId: string = createBatch.mock.calls[0][0][0].id;

    await worker.queue(makeBatch([makeMessage('m1')]), makeEnv(createBatch), ctx);
    expect(createBatch.mock.calls[1][0][0].id).toBe(firstId);
    expect(firstId).toMatch(/^emw_[0-9a-f]{60}$/);
  });

  it('acks a duplicate workflow instance in the per-message fallback', async () => {
    const message = makeMessage('m1');
    const createBatch = vi.fn().mockRejectedValue(new Error('Batch failed'));
    const create = vi.fn().mockRejectedValue(new Error('Workflow instance emw_123 already exists'));

    await worker.queue(makeBatch([message]), makeEnv(createBatch, create), ctx);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('retries a message when a non-duplicate error mentions "does not exist"', async () => {
    const message = makeMessage('m1');
    const createBatch = vi.fn().mockRejectedValue(new Error('Batch failed'));
    const create = vi.fn().mockRejectedValue(new Error('Queue does not exist'));

    await worker.queue(makeBatch([message]), makeEnv(createBatch, create), ctx);

    expect(message.retry).toHaveBeenCalledTimes(1);
    expect(message.ack).not.toHaveBeenCalled();
  });
});
