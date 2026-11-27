import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryableError } from '@rexezuge/errors';

const { mockListCandidates, mockMarkError, mockRecordTransientError, mockGetById } = vi.hoisted(() => ({
  mockListCandidates: vi.fn(),
  mockMarkError: vi.fn(),
  mockRecordTransientError: vi.fn(),
  mockGetById: vi.fn(),
}));

vi.mock('@mail-bee/backend-data/dao', () => ({
  ProviderSubscriptionDAO: vi.fn(function () {
    return {
      listActiveRenewalCandidates: mockListCandidates,
      markError: mockMarkError,
      recordTransientError: mockRecordTransientError,
      upsertActive: vi.fn(),
    };
  }),
  ConnectedApplicationDAO: vi.fn(function () {
    return { getById: mockGetById };
  }),
}));

import { SubscriptionRenewalUtil } from '@mail-bee/backend-services/subscription';

const subscription = {
  subscriptionId: 'sub-1',
  applicationId: 'app-1',
  providerId: 'microsoft-outlook',
  expiresAt: 0,
  renewalRetryCount: 0,
};

function makeUtil() {
  return new SubscriptionRenewalUtil({
    DB: {} as D1Queryable,
    AES_ENCRYPTION_KEY_SECRET: { get: async () => 'key' },
    OAUTH2_TOKEN_CACHE: {} as KVNamespace,
    OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
  });
}

describe('SubscriptionRenewalUtil failure recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCandidates.mockResolvedValue([subscription]);
    mockMarkError.mockResolvedValue(null);
    mockRecordTransientError.mockResolvedValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('redacts a permanent provider failure before persisting it', async () => {
    mockGetById.mockRejectedValue(new Error('Graph failed: access_token=super-secret-token'));

    await makeUtil().renewDueSubscriptions();

    expect(mockMarkError).toHaveBeenCalledTimes(1);
    const persisted: string = mockMarkError.mock.calls[0][1];
    expect(persisted).not.toContain('super-secret-token');
    expect(persisted).toContain('[REDACTED]');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('permanent failure'));
  });

  it('records a retryable failure as transient', async () => {
    mockGetById.mockRejectedValue(new RetryableError('throttled'));

    await makeUtil().renewDueSubscriptions();

    expect(mockMarkError).not.toHaveBeenCalled();
    expect(mockRecordTransientError).toHaveBeenCalledWith(
      'sub-1',
      expect.stringContaining('RetryableError: throttled'),
      expect.any(Number),
    );
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('retryable failure'));
  });
});
