import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@rexezuge/errors';

const {
  mockGetById,
  mockGetRowByEmail,
  mockTryStart,
  mockMarkSummarized,
  mockMarkSkipped,
  mockMarkError,
  mockGetRaw,
  mockGetOutlookRaw,
  mockGetToken,
} = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockGetRowByEmail: vi.fn(),
  mockTryStart: vi.fn(),
  mockMarkSummarized: vi.fn(),
  mockMarkSkipped: vi.fn(),
  mockMarkError: vi.fn(),
  mockGetRaw: vi.fn(),
  mockGetOutlookRaw: vi.fn(),
  mockGetToken: vi.fn(),
}));

vi.mock('@mail-bee/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { getById: mockGetById };
  }),
  ProcessedMessageDAO: vi.fn(function () {
    return { tryStart: mockTryStart, markSummarized: mockMarkSummarized, markSkipped: mockMarkSkipped, markError: mockMarkError };
  }),
  ProviderSubscriptionDAO: vi.fn(function () {
    return { getByApplication: vi.fn(), updateGmailHistory: vi.fn() };
  }),
  UserDAO: vi.fn(function () {
    return { getRowByEmail: mockGetRowByEmail };
  }),
}));

vi.mock('@mail-bee/provider-clients/gmail', () => ({
  GmailProviderUtil: { getRawMessage: mockGetRaw, listMessageIdsSince: vi.fn(), isMessageNotFoundError: vi.fn(() => false) },
}));
vi.mock('@mail-bee/provider-clients/outlook', () => ({
  OutlookProviderUtil: { getRawMessage: mockGetOutlookRaw, isMessageNotFoundError: vi.fn(() => false) },
}));
vi.mock('@mail-bee/backend-services/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetToken };
  }),
}));

import { ForwardingService } from '@mail-bee/backend-services/forwarding';
import type { ResolvedForwarding } from '@mail-bee/backend-services/forwarding';

const application = {
  applicationId: '11111111-1111-4111-8111-111111111111',
  userEmail: 'anchor@example.com',
  providerEmail: 'inbox@example.com',
  providerId: 'google-gmail' as const,
  status: 'connected' as const,
  connectionMethod: 'oauth2' as const,
};

const outlookApplication = { ...application, providerId: 'microsoft-outlook' as const };

function makeService(send: ReturnType<typeof vi.fn>) {
  return new ForwardingService({
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: async () => 'key' },
    EMAIL: { send },
    SEND_FROM: 'forward@mailbee.example',
  } as never);
}

function resolvedFor(app: typeof application | typeof outlookApplication): ResolvedForwarding {
  return { application: app as never, recipient: 'current@example.com' };
}

describe('ForwardingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(application);
    mockGetRowByEmail.mockResolvedValue({ current_email: 'current@example.com' });
    mockTryStart.mockResolvedValue(true);
    mockGetToken.mockResolvedValue('access-token');
    mockGetRaw.mockResolvedValue('Subject: Hello\r\n\r\nBody');
    mockGetOutlookRaw.mockResolvedValue('Subject: Hello\r\n\r\nBody');
  });

  it('forwards the unchanged MIME to the current sign-in address', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'sent-1' });
    const service = makeService(send);
    const resolved = await service.resolve(application.applicationId);
    expect(resolved.recipient).toBe('current@example.com');
    expect(resolved).not.toHaveProperty('accessToken');

    const outcome = await service.forwardMessage(resolved, 'provider-message-1');
    expect(outcome).toBe('forwarded');
    const message = send.mock.calls[0][0];
    expect(message.from).toBe('forward@mailbee.example');
    expect(message.to).toBe('current@example.com');
    expect(message.raw).toContain('Subject: Hello\r\n\r\nBody');
    expect(message.raw).toContain('X-Mail-Bee-Forwarded: yes');
    expect(mockMarkSummarized).toHaveBeenCalledWith(application.applicationId, 'provider-message-1');
  });

  it('resolves a fresh token inside the forward step instead of persisting one', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'sent-1' });
    const service = makeService(send);
    const resolved = await service.resolve(application.applicationId);
    mockGetToken.mockClear();
    mockGetToken.mockResolvedValue('fresh-token');

    await service.forwardMessage(resolved, 'provider-message-1');

    expect(mockGetToken).toHaveBeenCalledTimes(1);
    expect(mockGetRaw).toHaveBeenCalledWith('fresh-token', 'provider-message-1');
  });

  it('falls back to the anchor when current_email is blank, and rejects an invalid recipient', async () => {
    mockGetRowByEmail.mockResolvedValue({ current_email: ' '.repeat(3) });
    const service = makeService(vi.fn());
    await expect(service.resolve(application.applicationId)).resolves.toEqual({
      application,
      recipient: 'anchor@example.com',
    });

    mockGetRowByEmail.mockResolvedValue({ current_email: 'not-an-address' });
    await expect(service.resolve(application.applicationId)).rejects.toThrow('no valid forwarding recipient');
  });

  it('does not fetch or send a duplicate message', async () => {
    mockTryStart.mockResolvedValue(false);
    const send = vi.fn();
    const service = makeService(send);
    expect(await service.forwardMessage(resolvedFor(application), 'duplicate')).toBe('duplicate');
    expect(mockGetRaw).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips messages larger than the Email Service size limit', async () => {
    mockGetRaw.mockResolvedValue('x'.repeat(25 * 1024 * 1024 + 1));
    const send = vi.fn();
    const service = makeService(send);
    expect(await service.forwardMessage(resolvedFor(application), 'oversized')).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(mockMarkSkipped).toHaveBeenCalled();
  });

  it('classifies an unconfigured recipient as a permanent send failure', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('refused'), { code: 'E_RECIPIENT_PLAN_RESTRICTED' }));
    const service = makeService(send);
    await expect(service.forwardMessage(resolvedFor(application), 'msg')).rejects.toThrow('Email Sending refused the message');
    expect(mockMarkError).toHaveBeenCalledWith(application.applicationId, 'msg', 'send:E_RECIPIENT_PLAN_RESTRICTED');
  });

  it('treats disallowed headers as permanent and rate limits as retryable', async () => {
    const headerService = makeService(vi.fn().mockRejectedValue(Object.assign(new Error('header'), { code: 'E_HEADER_NOT_ALLOWED' })));
    await expect(headerService.forwardMessage(resolvedFor(application), 'header')).rejects.toThrow(
      'Email Sending refused the message (E_HEADER_NOT_ALLOWED)',
    );
    expect(mockMarkError).toHaveBeenCalledWith(application.applicationId, 'header', 'send:E_HEADER_NOT_ALLOWED');

    mockMarkError.mockClear();
    const rateService = makeService(vi.fn().mockRejectedValue(Object.assign(new Error('rate'), { code: 'E_RATE_LIMIT_EXCEEDED' })));
    await expect(rateService.forwardMessage(resolvedFor(application), 'rate')).rejects.toThrow('will retry');
    expect(mockMarkError).toHaveBeenCalledWith(application.applicationId, 'rate', 'send:E_RATE_LIMIT_EXCEEDED');
  });

  it('treats a malformed message TypeError as permanent', async () => {
    const service = makeService(vi.fn().mockRejectedValue(new TypeError('no recipient')));
    await expect(service.forwardMessage(resolvedFor(application), 'bad')).rejects.toThrow('Email Sending refused the message (TypeError)');
    expect(mockMarkError).toHaveBeenCalledWith(application.applicationId, 'bad', 'send:TypeError');
  });

  it('skips an Outlook message the provider no longer has', async () => {
    mockGetOutlookRaw.mockRejectedValue(new ProviderApiNonRetryableError('Microsoft Graph fetch failed (404)', 404));
    const send = vi.fn();
    const service = makeService(send);

    expect(await service.forwardMessage(resolvedFor(outlookApplication), 'gone')).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(mockMarkSkipped).toHaveBeenCalledWith(outlookApplication.applicationId, 'gone', 'fetch:E_PROVIDER_MESSAGE_GONE:404');
    expect(mockMarkError).not.toHaveBeenCalled();
  });

  it('keeps a permanent provider fetch failure permanent', async () => {
    mockGetOutlookRaw.mockRejectedValue(new ProviderApiNonRetryableError('Microsoft Graph fetch failed (401)', 401));
    const service = makeService(vi.fn());

    await expect(service.forwardMessage(resolvedFor(outlookApplication), 'denied')).rejects.toThrow('permanently');
    expect(mockMarkError).toHaveBeenCalledWith(outlookApplication.applicationId, 'denied', 'fetch:401');
  });

  it('keeps a transient provider fetch failure retryable', async () => {
    mockGetOutlookRaw.mockRejectedValue(new ProviderApiRetryableError('Microsoft Graph fetch failed (503)', 503));
    const service = makeService(vi.fn());

    await expect(service.forwardMessage(resolvedFor(outlookApplication), 'throttled')).rejects.toThrow('will retry');
    expect(mockMarkError).toHaveBeenCalledWith(outlookApplication.applicationId, 'throttled', 'fetch:503');
  });

  it('does not resend when recording the outcome fails after delivery', async () => {
    mockMarkSummarized.mockRejectedValue(new Error('d1 unavailable'));
    const send = vi.fn().mockResolvedValue({ messageId: 'sent-1' });
    const service = makeService(send);

    await expect(service.forwardMessage(resolvedFor(application), 'record-fail')).resolves.toBe('forwarded');
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockMarkSummarized).toHaveBeenCalledTimes(2);
    expect(mockMarkError).not.toHaveBeenCalled();
  });
});
