import { describe, expect, it } from 'vitest';
import { OAuth2StateUtil } from '@mail-bee/backend-services/oauth2';

describe('OAuth2StateUtil', () => {
  it('generates high-entropy state and PKCE verifiers', () => {
    expect(OAuth2StateUtil.generateState().length).toBeGreaterThanOrEqual(40);
    expect(OAuth2StateUtil.generateCodeVerifier().length).toBeGreaterThanOrEqual(80);
  });

  it('hashes state with SHA-256', async () => {
    expect(await OAuth2StateUtil.getStateHash('test-state')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('derives an unpadded base64url PKCE challenge', async () => {
    const challenge: string = await OAuth2StateUtil.getCodeChallenge('test-verifier');
    expect(challenge).not.toMatch(/[=+/]/);
  });
});
