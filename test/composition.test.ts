import { describe, expect, it, vi } from 'vitest';
import { createRequestScope, SCOPE_ENV_COVERAGE, Tokens } from '@mail-bee/backend-services/composition';
import { ApplicationService } from '@mail-bee/backend-services/application';
import { UserIdentityService } from '@mail-bee/backend-services/identity';
import { OAuth2AccessTokenService, OAuth2AuthorizationService } from '@mail-bee/backend-services/oauth2';
import { ProcessingService } from '@mail-bee/backend-services/processing';
import { WatchService } from '@mail-bee/backend-services/subscription';
import { UserService } from '@mail-bee/backend-services/user';

const env = {
  DB: {} as D1Queryable,
  AES_ENCRYPTION_KEY_SECRET: { get: vi.fn(async () => 'key') },
  OAUTH2_TOKEN_CACHE: {} as KVNamespace,
  OAUTH2_TOKEN_REFRESHERS: {} as DurableObjectNamespace,
};

describe('request composition', () => {
  it('exposes only the services a route or cron task resolves', () => {
    expect(Object.keys(Tokens).sort()).toEqual([
      'ApplicationService',
      'OAuth2AccessTokenService',
      'OAuth2AuthorizationService',
      'ProcessingService',
      'UserIdentityService',
      'UserService',
      'WatchService',
    ]);
  });

  it('resolves every bound service without reading a secret eagerly', () => {
    const scope = createRequestScope(env);
    expect(scope.get(Tokens.ApplicationService)).toBeInstanceOf(ApplicationService);
    expect(scope.get(Tokens.WatchService)).toBeInstanceOf(WatchService);
    expect(scope.get(Tokens.UserService)).toBeInstanceOf(UserService);
    expect(scope.get(Tokens.UserIdentityService)).toBeInstanceOf(UserIdentityService);
    expect(scope.get(Tokens.OAuth2AccessTokenService)).toBeInstanceOf(OAuth2AccessTokenService);
    expect(scope.get(Tokens.OAuth2AuthorizationService)).toBeInstanceOf(OAuth2AuthorizationService);
    expect(scope.get(Tokens.ProcessingService)).toBeInstanceOf(ProcessingService);
    expect(env.AES_ENCRYPTION_KEY_SECRET.get).not.toHaveBeenCalled();
  });

  it('shares one identity resolver across the scope', () => {
    const scope = createRequestScope(env);
    expect(scope.get(Tokens.UserIdentityService)).toBe(scope.get(Tokens.UserIdentityService));
  });

  it('proves its env declares every binding the resolved services require', () => {
    expect(SCOPE_ENV_COVERAGE.every((covered) => covered === true)).toBe(true);
  });
});
