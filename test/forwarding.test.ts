import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetById, mockGetRowByEmail, mockTryStart, mockMarkSummarized, mockMarkSkipped, mockMarkError, mockGetRaw, mockGetToken } =
  vi.hoisted(() => ({
    mockGetById: vi.fn(),
    mockGetRowByEmail: vi.fn(),
    mockTryStart: vi.fn(),
    mockMarkSummarized: vi.fn(),
    mockMarkSkipped: vi.fn(),
    mockMarkError: vi.fn(),
    mockGetRaw: vi.fn(),
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

vi.mock('@mail-bee/provider-clients/gmail', () => ({ GmailProviderUtil: { getRawMessage: mockGetRaw, listMessageIdsSince: vi.fn() } }));
vi.mock('@mail-bee/provider-clients/outlook', () => ({ OutlookProviderUtil: { getRawMessage: vi.fn() } }));
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

function makeService(send: ReturnType<typeof vi.fn>) {
  return new ForwardingService({
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: async () => 'key' },
    EMAIL: { send },
    SEND_FROM: 'forward@mailbee.example',
  } as never);
}

describe('ForwardingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(application);
    mockGetRowByEmail.mockResolvedValue({ current_email: 'current@example.com' });
    mockTryStart.mockResolvedValue(true);
    mockGetToken.mockResolvedValue('access-token');
    mockGetRaw.mockResolvedValue('Subject: Hello\r\n\r\nBody');
  });

  it('forwards the unchanged MIME to the current sign-in address', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'sent-1' });
    const service = makeService(send);
    const resolved = await service.resolve(application.applicationId);
    expect(resolved.recipient).toBe('current@example.com');

    const outcome = await service.forwardMessage(resolved, 'provider-message-1');
    expect(outcome).toBe('forwarded');
    const message = send.mock.calls[0][0];
    expect(message.from).toBe('forward@mailbee.example');
    expect(message.to).toBe('current@example.com');
    expect(message.raw).toContain('Subject: Hello\r\n\r\nBody');
    expect(message.raw).toContain('X-Mail-Bee-Forwarded: yes');
    expect(mockMarkSummarized).toHaveBeenCalledWith(application.applicationId, 'provider-message-1');
  });

  it('does not fetch or send a duplicate message', async () => {
    mockTryStart.mockResolvedValue(false);
    const send = vi.fn();
    const service = makeService(send);
    const resolved: ResolvedForwarding = { application: application as never, accessToken: 'token', recipient: 'user@example.com' };
    expect(await service.forwardMessage(resolved, 'duplicate')).toBe('duplicate');
    expect(mockGetRaw).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips messages larger than the Email Service size limit', async () => {
    mockGetRaw.mockResolvedValue('x'.repeat(25 * 1024 * 1024 + 1));
    const send = vi.fn();
    const service = makeService(send);
    const resolved: ResolvedForwarding = { application: application as never, accessToken: 'token', recipient: 'user@example.com' };
    expect(await service.forwardMessage(resolved, 'oversized')).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(mockMarkSkipped).toHaveBeenCalled();
  });

  it('classifies an unconfigured recipient as a permanent failure', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('refused'), { code: 'E_RECIPIENT_PLAN_RESTRICTED' }));
    const service = makeService(send);
    const resolved: ResolvedForwarding = { application: application as never, accessToken: 'token', recipient: 'user@example.com' };
    await expect(service.forwardMessage(resolved, 'msg')).rejects.toThrow('Email Sending refused the recipient');
    expect(mockMarkError).toHaveBeenCalledWith(application.applicationId, 'msg', 'E_RECIPIENT_PLAN_RESTRICTED');
  });
});
