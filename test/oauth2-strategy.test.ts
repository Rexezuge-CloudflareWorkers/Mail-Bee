import { describe, expect, it } from 'vitest';
import { OAuth2ProviderUtil, getOAuth2Strategy } from '@mail-bee/provider-clients/oauth2';

describe('OAuth2 provider strategy', () => {
  it('requests read-only scopes only', () => {
    expect(getOAuth2Strategy('google-gmail').requiredScopes).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(getOAuth2Strategy('microsoft-outlook').requiredScopes).toContain('Mail.Read');
    expect(getOAuth2Strategy('microsoft-outlook').requiredScopes).not.toContain('Mail.Send');
  });

  it('builds a consent URL with PKCE and state', () => {
    const url = new URL(
      OAuth2ProviderUtil.buildAuthorizationUrl({
        providerId: 'google-gmail',
        clientId: 'client-1',
        redirectUri: 'https://worker.example/api/oauth2/callback/app-1',
        state: 'state-1',
        codeChallenge: 'challenge-1',
      }),
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
  });

  it('rejects unknown providers', () => {
    expect(() => getOAuth2Strategy('unknown')).toThrow('Unsupported OAuth2 provider');
  });
});
