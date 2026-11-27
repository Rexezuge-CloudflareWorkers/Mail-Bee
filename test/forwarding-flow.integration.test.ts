import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Flow-level test: only the platform bindings and the provider's HTTP call are
 * faked. The webhook secret check, MIME rewrite, dedup DAO calls and dispatcher
 * id derivation all run their real implementations.
 */
const state = vi.hoisted(() => ({
  application: {
    applicationId: 'app-1',
    userEmail: 'anchor@example.com',
    providerEmail: 'inbox@example.com',
    providerId: 'google-gmail',
    status: 'connected',
    connectionMethod: 'oauth2',
  },
  processed: new Map<string, { status: string; reason?: string }>(),
  subscription: { subscriptionId: 'sub-1', applicationId: 'app-1', webhookSecretHash: '', status: 'active' },
  sent: [] as Array<{ from: string; to: string; raw: string }>,
  touched: [] as string[],
}));

vi.mock('@mail-bee/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getById: async () => state.application };
  }),
  UserDAO: vi.fn(function () {
    return { getRowByEmail: async () => ({ current_email: 'current@example.com' }) };
  }),
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      getByApplication: async () => state.subscription,
      getByExternalSubscriptionId: async () => state.subscription,
      touchNotification: async (id: string) => {
        state.touched.push(id);
      },
      markError: vi.fn(),
    };
  }),
  ProcessedMessageDAO: vi.fn(function () {
    return {
      tryStart: async (applicationId: string, _providerId: string, messageId: string) => {
        const key = `${applicationId}:${messageId}`;
        if (state.processed.has(key)) return false;
        state.processed.set(key, { status: 'processing' });
        return true;
      },
      markSummarized: async (applicationId: string, messageId: string) => {
        state.processed.set(`${applicationId}:${messageId}`, { status: 'summarized' });
      },
      markSkipped: async (applicationId: string, messageId: string, reason: string) => {
        state.processed.set(`${applicationId}:${messageId}`, { status: 'skipped', reason });
      },
      markError: vi.fn(),
    };
  }),
}));

vi.mock('@mail-bee/provider-clients/gmail', () => ({
  GmailProviderUtil: {
    getRawMessage: vi.fn(
      async () =>
        'Received: from relay.example by mx.example\r\nFrom: Sender <sender@other.example>\r\nSubject: Invoice\r\n\r\nAttached below.',
    ),
    listMessageIdsSince: vi.fn(async () => ({ messageIds: ['provider-1'], historyId: '43' })),
    isMessageNotFoundError: vi.fn(() => false),
  },
}));

vi.mock('@mail-bee/backend-services/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: async () => 'access-token' };
  }),
}));

import { EmailEventsDispatcherWorker } from '@mail-bee/background/EmailEventsDispatcherWorker';
import { ForwardingService } from '@mail-bee/backend-services/forwarding';
import { GmailWebhookService } from '@mail-bee/backend-services/webhook';
import { WebhookSecurityUtil } from '@mail-bee/provider-clients/webhook';
import type { EmailQueueMessage } from '@mail-bee/shared/model';

const secret = 'webhook-secret';
const workflowInputs: Array<{ id: string; params: EmailQueueMessage }> = [];

function makeEnv() {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: async () => 'key' },
    SEND_FROM: 'forward@mailbee.example',
    EMAIL: {
      send: async (message: { from: string; to: string; raw: string }) => {
        state.sent.push(message);
        return { messageId: 'sent-1' };
      },
    },
    EMAIL_EVENTS_QUEUE: { send: async () => {} },
    EMAIL_PROCESSING_WORKFLOW: {
      createBatch: async (inputs: Array<{ id: string; params: EmailQueueMessage }>) => {
        workflowInputs.push(...inputs);
      },
      create: vi.fn(),
    },
  } as never;
}

describe('forwarding flow', () => {
  beforeEach(() => {
    state.processed.clear();
    state.sent.length = 0;
    state.touched.length = 0;
    workflowInputs.length = 0;
  });

  it('turns a signed Gmail webhook into a forwarded, deduplicated message', async () => {
    state.subscription.webhookSecretHash = await WebhookSecurityUtil.hashSecret(secret);
    const env = makeEnv();
    const payload: EmailQueueMessage = {
      type: 'gmail-notification',
      applicationId: 'app-1',
      notificationHistoryId: '42',
      pubsubMessageId: 'pubsub-1',
      callbackBaseUrl: 'https://worker.example',
    };

    const queue = {
      send: async (message: EmailQueueMessage) => {
        // The real queue binding is replaced by the dispatcher in this test.
        queued.push(message);
      },
    };
    const queued: EmailQueueMessage[] = [];
    await GmailWebhookService.handleNotification(
      {
        applicationId: 'app-1',
        token: secret,
        messageData: WebhookSecurityUtil.base64UrlEncodeString(JSON.stringify({ historyId: '42' })),
        pubsubMessageId: 'pubsub-1',
        callbackBaseUrl: 'https://worker.example',
      },
      { ...env, EMAIL_EVENTS_QUEUE: queue } as never,
    );
    expect(queued).toEqual([payload]);
    expect(state.touched).toEqual(['sub-1']);

    const messages = queued.map((message, index) => ({ id: `message-${index}`, body: message, ack: vi.fn(), retry: vi.fn() }));
    await new EmailEventsDispatcherWorker().queue({ queue: 'email-events', messages } as never, env, {} as ExecutionContext);
    expect(workflowInputs).toHaveLength(1);
    expect(workflowInputs[0].id).toMatch(/^emw_[0-9a-f]{60}$/);

    const service = new ForwardingService(env);
    const resolved = await service.resolve('app-1');
    expect(resolved.recipient).toBe('current@example.com');

    expect(await service.forwardMessage(resolved, 'provider-1')).toBe('forwarded');
    expect(state.sent).toHaveLength(1);
    const forwarded = state.sent[0];
    expect(forwarded.from).toBe('forward@mailbee.example');
    expect(forwarded.to).toBe('current@example.com');
    expect(forwarded.raw).toContain('From: forward@mailbee.example\r\n');
    expect(forwarded.raw).toContain('Reply-To: sender@other.example\r\n');
    expect(forwarded.raw).not.toContain('Received:');
    expect(forwarded.raw.endsWith('Attached below.')).toBe(true);
    expect(state.processed.get('app-1:provider-1')?.status).toBe('summarized');

    expect(await service.forwardMessage(resolved, 'provider-1')).toBe('duplicate');
    expect(state.sent).toHaveLength(1);
  });

  it('rejects a webhook whose token does not match the stored hash', async () => {
    state.subscription.webhookSecretHash = await WebhookSecurityUtil.hashSecret('different-secret');
    const env = makeEnv();
    const queue = { send: vi.fn() };

    await expect(
      GmailWebhookService.handleNotification({ applicationId: 'app-1', token: secret, messageData: 'ignored' }, {
        ...env,
        EMAIL_EVENTS_QUEUE: queue,
      } as never),
    ).rejects.toThrow('Invalid Gmail webhook token');
    expect(queue.send).not.toHaveBeenCalled();
  });
});
