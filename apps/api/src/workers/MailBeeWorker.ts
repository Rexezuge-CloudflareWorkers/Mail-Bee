import { AbstractEntrypointWorker } from '@mail-bee/backend-runtime/base';
import { fromHono, type HonoOpenAPIRouterType } from 'chanfana';
import { Hono } from 'hono';
import { allRoutes } from '@/endpoints/routeTable';
import { SPA_HTML } from '@/generated/spa-shell';
import { MiddlewareHandlers, PUBLIC_CALLBACK_LIMIT, securityHeadersMiddleware, USER_API_LIMIT } from '@/middleware';
import { DURABLE_OBJECT_CRON_TASKS_RUN_URL, DURABLE_OBJECT_NAMESPACE_GLOBAL } from '@mail-bee/backend-runtime/constants';
import { createD1SessionEnv } from '@mail-bee/backend-services/composition';
import { logError } from '@mail-bee/shared/utils';

const D1_BOOKMARK_HEADER = 'x-d1-bookmark';

interface AuthenticatedUserVariables {
  AuthenticatedUserId: string;
  AuthenticatedUserEmailAddress: string;
  AuthenticatedUserAnchorEmail: string;
}

type AppRouter = HonoOpenAPIRouterType<{
  Bindings: Env;
  Variables: AuthenticatedUserVariables;
}>;

/**
The deployed Worker: HTTP API + SPA shell, cron and queue entrypoints.
*/
class MailBeeWorker extends AbstractEntrypointWorker {
  protected readonly app: AppRouter;

  constructor() {
    super();
    const app: Hono<{ Bindings: Env; Variables: AuthenticatedUserVariables }> = new Hono<{
      Bindings: Env;
      Variables: AuthenticatedUserVariables;
    }>();

    app.use('*', securityHeadersMiddleware);
    app.get('/', (c) => c.redirect('/user/'));
    app.get('/user', (c) => c.redirect('/user/' + new URL(c.req.url).search));
    app.options(
      '/user/*',
      () =>
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': `Content-Type, Authorization, cf-access-jwt-assertion, ${D1_BOOKMARK_HEADER}`,
            'Access-Control-Expose-Headers': D1_BOOKMARK_HEADER,
            'Access-Control-Max-Age': '86400',
          },
        }),
    );

    app.use('/user/*', MiddlewareHandlers.userAuthentication());
    // Registered after authentication so the limiter keys on the account.
    app.use('/user/*', USER_API_LIMIT);
    app.use('/api/oauth2/callback/*', PUBLIC_CALLBACK_LIMIT);

    const openapi: AppRouter = fromHono(app, { docs_url: '/docs', openapi_url: '/openapi.json' });
    for (const { method, path, handler } of allRoutes) {
      openapi[method](path, handler);
    }

    app.get('*', (c) => {
      const path: string = new URL(c.req.url).pathname;
      return path.startsWith('/user/') ? c.html(SPA_HTML) : c.notFound();
    });
    this.app = openapi;
  }

  protected async onRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path: string = new URL(request.url).pathname;
    const database = (env as { DB?: { withSession?: unknown } }).DB;
    if ((!path.startsWith('/user/') && !path.startsWith('/api/')) || typeof database?.withSession !== 'function') {
      return this.app.fetch(request, env, ctx);
    }

    const isUserRequest: boolean = path.startsWith('/user/');
    const bookmark: string | undefined = isUserRequest ? request.headers.get(D1_BOOKMARK_HEADER)?.trim() || undefined : undefined;
    const sessionEnv = createD1SessionEnv(env, bookmark || 'first-primary');
    const response: Response = await this.app.fetch(request, sessionEnv, ctx);
    if (isUserRequest) {
      const nextBookmark: D1SessionBookmark | null = sessionEnv.DB.getBookmark();
      if (nextBookmark) response.headers.set(D1_BOOKMARK_HEADER, nextBookmark);
      response.headers.set('Access-Control-Expose-Headers', D1_BOOKMARK_HEADER);
    }
    return response;
  }

  protected async onScheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const id: DurableObjectId = env.CRON_TASKS.idFromName(DURABLE_OBJECT_NAMESPACE_GLOBAL);
    const request = new Request(DURABLE_OBJECT_CRON_TASKS_RUN_URL, {
      method: 'POST',
      body: JSON.stringify({ cron: event.cron, scheduledTime: event.scheduledTime }),
    });
    ctx.waitUntil(
      env.CRON_TASKS.get(id)
        .fetch(request)
        .then(async (response: Response): Promise<void> => {
          if (!response.ok && response.status !== 202) {
            logError('error', `CronTasksWorker returned ${response.status}`, await response.text());
          }
        })
        .catch((error: unknown): void => {
          logError('error', 'Failed to invoke CronTasksWorker', error);
        }),
    );
  }

  protected override reportUnhandled(message: string, error: unknown): void {
    logError('error', message, error);
  }
}

export { MailBeeWorker };
