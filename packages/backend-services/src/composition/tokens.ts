import type { Token } from '@mail-bee/backend-runtime/di';
import type { ApplicationService } from '../application/ApplicationService';
import type { UserIdentityService } from '../identity/UserIdentityService';
import type { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AuthorizationService } from '../oauth2/OAuth2AuthorizationService';
import type { ProcessingService } from '../processing/ProcessingService';
import type { WatchService } from '../subscription/WatchService';
import type { UserService } from '../user/UserService';

/**
 * The services a route or a registered cron task actually resolves.
 *
 * Tokens carry their value type (`Token<T>`) so `scope.get(...)` infers the
 * service type without an explicit generic at call sites. Anything not here is
 * either unused by Mail-Bee or constructed by its owning service as an
 * implementation detail — not a separate composition-root responsibility.
 */
const Tokens = {
  ApplicationService: Symbol('ApplicationService') as Token<ApplicationService>,
  WatchService: Symbol('WatchService') as Token<WatchService>,
  UserService: Symbol('UserService') as Token<UserService>,
  UserIdentityService: Symbol('UserIdentityService') as Token<UserIdentityService>,
  OAuth2AccessTokenService: Symbol('OAuth2AccessTokenService') as Token<OAuth2AccessTokenService>,
  OAuth2AuthorizationService: Symbol('OAuth2AuthorizationService') as Token<OAuth2AuthorizationService>,
  ProcessingService: Symbol('ProcessingService') as Token<ProcessingService>,
} satisfies Record<string, Token<unknown>>;

export { Tokens };
