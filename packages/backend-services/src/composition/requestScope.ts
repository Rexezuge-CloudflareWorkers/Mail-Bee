import { ConnectedApplicationDAO, ProviderSubscriptionDAO, UserDAO, UserEmailDAO } from '@mail-bee/backend-data/dao';
import type { D1Queryable } from '@mail-bee/backend-data/utils';
import { Container } from '@mail-bee/backend-runtime/di';
// Service imports use package entry points rather than relative paths so route
// unit tests that mock those modules keep working after a composition change.
import { ApplicationService } from '@mail-bee/backend-services/application';
import type { ApplicationServiceEnv } from '@mail-bee/backend-services/application';
import { UserIdentityService } from '@mail-bee/backend-services/identity';
import { OAuth2AccessTokenService, OAuth2AuthorizationService } from '@mail-bee/backend-services/oauth2';
import type { OAuth2AccessTokenServiceEnv, OAuth2AuthorizationServiceEnv } from '@mail-bee/backend-services/oauth2';
import { ProcessingService } from '@mail-bee/backend-services/processing';
import type { ProcessingServiceEnv } from '@mail-bee/backend-services/processing';
import { WatchService } from '@mail-bee/backend-services/subscription';
import type { WatchServiceEnv } from '@mail-bee/backend-services/subscription';
import { UserService } from '@mail-bee/backend-services/user';
import type { UserServiceEnv } from '@mail-bee/backend-services/user';
import { Tokens } from './tokens';

/**
 * The bindings the services resolved from this scope can use.
 *
 * Secrets stay optional because a route declares only the bindings it needs;
 * each service narrows the env it receives through the assertions below. A
 * service gaining a required binding now fails typecheck here instead of
 * surfacing at runtime as an undefined binding.
 */
interface RequestScopeEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET?: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE?: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS?: DurableObjectNamespace;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  AI?: Ai;
  MAX_APPLICATIONS_PER_USER?: string;
  MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string;
  AI_DAILY_NEURON_FREE_TIER_LIMIT?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OAUTH2_STATE_EXPIRY_MINUTES?: string;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
  AI_SUMMARY_MODEL?: string;
}

type AssertCoversKeys<TSource, TTarget> =
  Exclude<keyof TTarget, keyof TSource> extends never
    ? true
    : ['RequestScopeEnv is missing bindings required by TTarget', Exclude<keyof TTarget, keyof TSource>];

type ServiceEnvNarrowing = ApplicationServiceEnv &
  WatchServiceEnv &
  UserServiceEnv &
  OAuth2AccessTokenServiceEnv &
  OAuth2AuthorizationServiceEnv &
  ProcessingServiceEnv;

type ScopeCoverage = [
  AssertCoversKeys<RequestScopeEnv, ApplicationServiceEnv>,
  AssertCoversKeys<RequestScopeEnv, WatchServiceEnv>,
  AssertCoversKeys<RequestScopeEnv, UserServiceEnv>,
  AssertCoversKeys<RequestScopeEnv, OAuth2AccessTokenServiceEnv>,
  AssertCoversKeys<RequestScopeEnv, OAuth2AuthorizationServiceEnv>,
  AssertCoversKeys<RequestScopeEnv, ProcessingServiceEnv>,
];

/**
 * Instantiates the assertions above. A service that gains a required binding
 * the scope does not declare fails `pnpm run typecheck` here.
 */
export const SCOPE_ENV_COVERAGE: ScopeCoverage = [true, true, true, true, true, true];

function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= fn());
}

/**
 * Composition root for the services a request resolves.
 *
 * Earlier revisions bound every service inherited from Mail-Otter — AI, chat,
 * digest, actions, integrations — even though Mail-Bee has no route or workflow
 * that calls them. Those binds also forced unrelated bindings into this env
 * type. Keeping only the seven resolved tokens makes the env contract honest
 * and leaves the unused services to be created by their owners if needed.
 */
function createRequestScope(env: RequestScopeEnv): Container {
  const serviceEnv = env as unknown as ServiceEnvNarrowing;
  const scope = new Container();

  // One Secrets Store read per request, shared by the DAOs that need it.
  const masterKey = memoize(() => {
    if (!env.AES_ENCRYPTION_KEY_SECRET) throw new Error('AES_ENCRYPTION_KEY_SECRET is not configured for this scope.');
    return env.AES_ENCRYPTION_KEY_SECRET.get();
  });
  const applicationDAO = memoize(async () => new ConnectedApplicationDAO(env.DB, await masterKey()));
  const subscriptionDAO = memoize(() => Promise.resolve(new ProviderSubscriptionDAO(env.DB)));
  const userDAO = memoize(() => Promise.resolve(new UserDAO(env.DB)));
  const userEmailDAO = memoize(() => Promise.resolve(new UserEmailDAO(env.DB)));

  // One identity resolver per request: ownership checks can resolve the caller
  // several times, and its address memo is only useful when shared.
  scope.bind(Tokens.UserIdentityService, () => new UserIdentityService({ DB: env.DB }));
  const identity = (): Promise<UserIdentityService> => Promise.resolve(scope.get(Tokens.UserIdentityService));

  scope.bind(
    Tokens.ApplicationService,
    () =>
      new ApplicationService(serviceEnv, {
        applicationDAO,
        watchService: () => Promise.resolve(scope.get(Tokens.WatchService)),
        tokenService: () => Promise.resolve(scope.get(Tokens.OAuth2AccessTokenService)),
      }),
  );
  scope.bind(
    Tokens.WatchService,
    () =>
      new WatchService(serviceEnv, {
        subscriptionDAO,
        applicationDAO,
        tokenService: () => Promise.resolve(scope.get(Tokens.OAuth2AccessTokenService)),
      }),
  );
  scope.bind(Tokens.UserService, () => new UserService(serviceEnv, { userDAO, userEmailDAO, userIdentity: identity }));
  scope.bind(Tokens.OAuth2AccessTokenService, () => new OAuth2AccessTokenService(serviceEnv));
  scope.bind(Tokens.OAuth2AuthorizationService, () => new OAuth2AuthorizationService(serviceEnv));
  scope.bind(Tokens.ProcessingService, () => new ProcessingService(serviceEnv));

  return scope;
}

export { createRequestScope };
export type { RequestScopeEnv };
