import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationResponse } from '@mail-bee/backend-services/application';
import { Tokens, createRequestScope } from '@mail-bee/backend-services/composition';

class ListApplicationsRoute extends IUserRoute<ListApplicationsRequest, ListApplicationsResponse, ListApplicationsEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'List connected mailbox applications',
    responses: {
      '200': {
        description: 'Connected applications',
      },
    },
  };

  protected async handleRequest(
    request: ListApplicationsRequest,
    env: ListApplicationsEnv,
    cxt: RouteContext<ListApplicationsEnv>,
  ): Promise<ListApplicationsResponse> {
    const scope = createRequestScope(env);
    return {
      applications: await scope.get(Tokens.ApplicationService).listUserApplications(this.getAuthenticatedUser(cxt), request.raw),
    };
  }
}

type ListApplicationsRequest = IRequest;

interface ListApplicationsResponse extends IResponse {
  applications: ApplicationResponse[];
}

type ListApplicationsEnv = IUserEnv;

export { ListApplicationsRoute };
