import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetByApplication, mockGetByExternalSubscriptionId, mockTouchNotification, mockMatchesSecret, mockDecode } = vi.hoisted(() => ({
  mockGetByApplication: vi.fn(),
  mockGetByExternalSubscriptionId: vi.fn(),
  mockTouchNotification: vi.fn(),
  mockMatchesSecret: vi.fn(),
  mockDecode: vi.fn(),
}));

vi.mock('@mail-bee/backend-data/dao', () => ({
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      getByApplication: mockGetByApplication,
      getByExternalSubscriptionId: mockGetByExternalSubscriptionId,
      touchNotification: mockTouchNotification,
      markError: vi.fn(),
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

  it('extracts Outlook message ids from resource URLs', () => {
    expect(OutlookWebhookService.extractMessageId('Users/u/Messages/AAMkAGI2')).toBe('AAMkAGI2');
    expect(OutlookWebhookService.extractMessageId('Users/u/Messages/AAMk/replies')).toBeUndefined();
  });
});
