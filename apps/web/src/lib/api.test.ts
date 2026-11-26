import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiPost, readJson } from './api';

describe('SPA API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serialises query parameters and parses JSON', async () => {
    const json = vi.fn().mockResolvedValue({ applications: [] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json }));
    expect(await apiGet<{ applications: unknown[] }>('/user/applications', { applicationId: 'app-1' })).toEqual({ applications: [] });
    expect(fetch).toHaveBeenCalledWith('/user/applications?applicationId=app-1', { credentials: 'same-origin' });
  });

  it('posts JSON bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorizationUrl: 'https://example.com' }) }));
    await apiPost('/user/application/oauth2/authorize', { applicationId: 'app-1' });
    expect(fetch).toHaveBeenCalledWith(
      '/user/application/oauth2/authorize',
      expect.objectContaining({ method: 'POST', body: '{"applicationId":"app-1"}' }),
    );
  });

  it('surfaces error bodies', async () => {
    await expect(readJson({ ok: false, status: 400, text: async () => 'bad input' } as Response)).rejects.toThrow('bad input');
  });
});
