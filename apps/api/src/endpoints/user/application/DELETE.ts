import { BadRequestError } from '@rexezuge/errors';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { Tokens, createRequestScope } from '@mail-bee/backend-services/composition';

class DeleteApplicationRoute extends IUserRoute<DeleteApplicationRequest, DeleteApplicationResponse, DeleteApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Delete connected application',
    responses: {
      '200': {
        description: 'Application deleted',
      },
    },
  };

  protected async handleRequest(
    request: DeleteApplicationRequest,
    env: DeleteApplicationEnv,
    cxt: RouteContext<DeleteApplicationEnv>,
  ): Promise<DeleteApplicationResponse> {
    const scope = createRequestScope(env);
    const applicationId: string | undefined = this.getQueryParam(request, 'applicationId') ?? request.applicationId;
    if (!applicationId) throw new BadRequestError('applicationId is required.');
    await scope.get(Tokens.ApplicationService).deleteUserApplication(this.getAuthenticatedUser(cxt), applicationId);
    return { success: true, deleted: true };
  }
}

interface DeleteApplicationRequest extends IRequest {
  applicationId: string;
}

interface DeleteApplicationResponse extends IResponse {
  success: boolean;
  deleted: boolean;
}

interface DeleteApplicationEnv extends IUserEnv {
  EMAIL_CONTEXT_INDEX?: Vectorize;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
}

export { DeleteApplicationRoute };
