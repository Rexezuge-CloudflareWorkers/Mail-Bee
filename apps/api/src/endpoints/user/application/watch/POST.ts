import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { BaseUrlUtil } from '@mail-bee/shared/utils';
import { Tokens, createRequestScope } from '@mail-bee/backend-services/composition';

class StartApplicationWatchRoute extends IUserRoute<StartApplicationWatchRequest, StartApplicationWatchResponse, StartApplicationWatchEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Start provider push notifications',
    responses: {
      '200': {
        description: 'Watch started',
      },
    },
  };

  protected async handleRequest(
    request: StartApplicationWatchRequest,
    env: StartApplicationWatchEnv,
    cxt: RouteContext<StartApplicationWatchEnv>,
  ): Promise<StartApplicationWatchResponse> {
    const scope = createRequestScope(env);
    const result = await scope
      .get(Tokens.WatchService)
      .startApplicationWatch(this.getAuthenticatedUser(cxt), request.applicationId, BaseUrlUtil.getBaseUrl(request.raw));
    return { ...result, status: 'active' as const };
  }
}

interface StartApplicationWatchRequest extends IRequest {
  applicationId: string;
}

interface StartApplicationWatchResponse extends IResponse {
  message: string;
  webhookUrl: string;
  watchStatus: string;
  watchExpiresAt?: number;
  status: 'active';
}

interface StartApplicationWatchEnv extends IUserEnv {
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
}

export { StartApplicationWatchRoute };
