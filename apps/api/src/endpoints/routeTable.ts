import type { OpenAPIRoute } from 'chanfana';
import {
  CreateApplicationRoute,
  CreateOAuth2AuthorizationRoute,
  DeleteApplicationRoute,
  GetCurrentUserRoute,
  GmailWebhookRoute,
  ListApplicationsRoute,
  ListProcessedMessagesRoute,
  OAuth2CallbackRoute,
  OutlookLifecycleWebhookRoute,
  OutlookWebhookRoute,
  StartApplicationWatchRoute,
  StopApplicationWatchRoute,
} from '@/endpoints';

type RouteMethod = 'get' | 'post' | 'put' | 'delete';

interface RouteDefinition {
  readonly method: RouteMethod;
  readonly path: string;
  readonly handler: typeof OpenAPIRoute;
}

/**
Routes behind Cloudflare Access.
*/
const userRoutes: readonly RouteDefinition[] = [
  { method: 'get', path: '/user/me', handler: GetCurrentUserRoute },
  { method: 'get', path: '/user/applications', handler: ListApplicationsRoute },
  { method: 'post', path: '/user/application', handler: CreateApplicationRoute },
  { method: 'delete', path: '/user/application', handler: DeleteApplicationRoute },
  { method: 'post', path: '/user/application/oauth2/authorize', handler: CreateOAuth2AuthorizationRoute },
  { method: 'post', path: '/user/application/watch', handler: StartApplicationWatchRoute },
  { method: 'post', path: '/user/application/stop', handler: StopApplicationWatchRoute },
  { method: 'get', path: '/user/application/messages', handler: ListProcessedMessagesRoute },
];

/**
Public callback: state, PKCE and a random one-time secret protect it.
*/
const publicApiRoutes: readonly RouteDefinition[] = [
  { method: 'get', path: '/api/oauth2/callback/:applicationId', handler: OAuth2CallbackRoute },
];

/**
Provider callbacks: authenticated by webhook secret / clientState.
*/
const webhookRoutes: readonly RouteDefinition[] = [
  { method: 'post', path: '/api/webhooks/gmail/:applicationId', handler: GmailWebhookRoute },
  { method: 'get', path: '/api/webhooks/outlook/:applicationId', handler: OutlookWebhookRoute },
  { method: 'post', path: '/api/webhooks/outlook/:applicationId', handler: OutlookWebhookRoute },
  { method: 'get', path: '/api/webhooks/outlook/lifecycle/:applicationId', handler: OutlookLifecycleWebhookRoute },
  { method: 'post', path: '/api/webhooks/outlook/lifecycle/:applicationId', handler: OutlookLifecycleWebhookRoute },
];

const allRoutes: readonly RouteDefinition[] = [...userRoutes, ...publicApiRoutes, ...webhookRoutes];
const allRouteKeys: readonly string[] = allRoutes.map((route: RouteDefinition): string => `${route.method.toUpperCase()} ${route.path}`);

export { allRouteKeys, allRoutes, publicApiRoutes, userRoutes, webhookRoutes };
export type { RouteDefinition, RouteMethod };
