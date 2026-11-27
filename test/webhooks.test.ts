import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetByApplication, mockGetByExternalSubscriptionId, mockTouchNotification, mockMarkError, mockMatchesSecret, mockDecode } =
  vi.hoisted(() => ({
    mockGetByApplication: vi.fn(),
    mockGetByExternalSubscriptionId: vi.fn(),
    mockTouchNotification: vi.fn(),
    mockMarkError: vi.fn(),
    mockMatchesSecret: vi.fn(),
    mockDecode: vi.fn(),
  }));

vi.mock('@mail-bee/backend-data/dao', () => ({
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      getByApplication: mockGetByApplication,
      getByExternalSubscriptionId: mockGetByExternalSubscriptionId,
      touchNotification: mockTouchNotification,
      markError: mockMarkError,
    };
  }),
}));

vi.mock('@mail-bee/provider-clients/webhook', () => ({
  WebhookSecurityUtil: {
    matchesSecret: mockMatchesSecret,
    base64UrlDecodeToString: mockDecode,
    generateSecret: vi.fn(() => 'secret'),
  },
}));

import { GmailWebhookService } from '@mail-bee/backend-services/webhook';
import { OutlookWebhookService } from '@mail-bee/backend-services/webhook';

function env() {
  return { DB: {} as D1Database, EMAIL_EVENTS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } };
}

describe('provider webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a Gmail notification only with a matching secret', async () => {
    mockGetByApplication.mockResolvedValue({ subscriptionId: 'sub-1', webhookSecretHash: 'hash' });
    mockMatchesSecret.mockResolvedValue(true);
    mockDecode.mockReturnValue(JSON.stringify({ historyId: '42', emailAddress: 'user@gmail.com' }));
    const e = env();
    await GmailWebhookService.handleNotification({ applicationId: 'app-1', token: 'token', messageData: 'data' }, e);
    expect(e.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gmail-notification', notificationHistoryId: '42', applicationId: 'app-1' }),
    );
    expect(mockTouchNotification).toHaveBeenCalledWith('sub-1');
  });

  it('rejects a Gmail notification with a bad token', async () => {
    mockGetByApplication.mockResolvedValue({ subscriptionId: 'sub-1', webhookSecretHash: 'hash' });
    mockMatchesSecret.mockResolvedValue(false);
    await expect(
      GmailWebhookService.handleNotification({ applicationId: 'app-1', token: 'bad', messageData: 'data' }, env() as never),
    ).rejects.toThrow('Invalid Gmail webhook token.');
  });

  it('rejects a malformed Gmail payload as a client error, not a server error', async () => {
    mockGetByApplication.mockResolvedValue({ subscriptionId: 'sub-1', webhookSecretHash: 'hash' });
    mockMatchesSecret.mockResolvedValue(true);

    mockDecode.mockImplementation(() => {
      throw new DOMException('InvalidCharacterError');
    });
    await expect(
      GmailWebhookService.handleNotification({ applicationId: 'app-1', token: 'token', messageData: 'data' }, env() as never),
    ).rejects.toThrow('not valid base64-encoded JSON');

    mockDecode.mockReturnValue('{"historyId":');
    await expect(
      GmailWebhookService.handleNotification({ applicationId: 'app-1', token: 'token', messageData: 'data' }, env() as never),
    ).rejects.toThrow('not valid base64-encoded JSON');

    mockDecode.mockReturnValue('{"historyId":42}');
    await expect(
      GmailWebhookService.handleNotification({ applicationId: 'app-1', token: 'token', messageData: 'data' }, env() as never),
    ).rejects.toThrow('missing historyId');
  });

  it('authorizes an Outlook notification and enqueues only notifications with a message id', async () => {
    mockGetByExternalSubscriptionId.mockResolvedValue({ subscriptionId: 'sub-1', applicationId: 'app-1', clientStateHash: 'hash' });
    mockMatchesSecret.mockResolvedValue(true);
    const e = env();

    await OutlookWebhookService.handleNotifications(
      'app-1',
      [
        { subscriptionId: 'sub-1', clientState: 'state', resourceData: { id: 'message-1' } },
        { subscriptionId: 'sub-1', clientState: 'state', resource: 'Users/u/Messages/message-2' },
        { subscriptionId: 'sub-1', clientState: 'state', resource: 'Users/u/Messages/message-3/replies' },
      ],
      e as never,
      'https://worker.example',
    );

    expect(e.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledTimes(2);
    expect(e.EMAIL_EVENTS_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'outlook-notification', messageId: 'message-1' }),
    );
    expect(mockTouchNotification).toHaveBeenCalledTimes(2);
  });

  it('rejects an Outlook notification for another application or a bad clientState', async () => {
    mockGetByExternalSubscriptionId.mockResolvedValue({ subscriptionId: 'sub-1', applicationId: 'other-app' });
    await expect(OutlookWebhookService.handleNotifications('app-1', [{ subscriptionId: 'sub-1' }], env() as never)).rejects.toThrow(
      'Unknown Outlook subscription',
    );

    mockGetByExternalSubscriptionId.mockResolvedValue({ subscriptionId: 'sub-1', applicationId: 'app-1', clientStateHash: 'hash' });
    mockMatchesSecret.mockResolvedValue(false);
    await expect(
      OutlookWebhookService.handleNotifications('app-1', [{ subscriptionId: 'sub-1', clientState: 'bad' }], env() as never),
    ).rejects.toThrow('Invalid Outlook clientState');
  });

  it('marks an Outlook subscription in error on a lifecycle removal event', async () => {
    mockGetByExternalSubscriptionId.mockResolvedValue({ subscriptionId: 'sub-1', applicationId: 'app-1', clientStateHash: 'hash' });
    mockMatchesSecret.mockResolvedValue(true);

    await OutlookWebhookService.handleLifecycleNotifications(
      'app-1',
      [{ subscriptionId: 'sub-1', lifecycleEvent: 'subscriptionRemoved' }],
      env() as never,
    );

    expect(mockMarkError).toHaveBeenCalledWith('sub-1', 'Outlook lifecycle event: subscriptionRemoved');
  });

  it('extracts Outlook message ids from resource URLs', () => {
    expect(OutlookWebhookService.extractMessageId('Users/u/Messages/AAMkAGI2')).toBe('AAMkAGI2');
    expect(OutlookWebhookService.extractMessageId('Users/u/Messages/AAMk/replies')).toBeUndefined();
  });
});
