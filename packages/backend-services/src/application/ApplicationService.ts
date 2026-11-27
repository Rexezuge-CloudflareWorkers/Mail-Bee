import { ApplicationContextDAO, ConnectedApplicationDAO, OAuth2AccessTokenCacheDAO } from '@mail-bee/backend-data/dao';
import { WatchService } from '../subscription/WatchService';
import type { WatchServiceEnv } from '../subscription/WatchService';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AccessTokenServiceEnv } from '../oauth2/OAuth2AccessTokenService';
import type { UserScope } from '@mail-bee/backend-data/dao';
import type { ApplicationResponse } from './ApplicationResponseUtil';
import { ApplicationCrudService } from './ApplicationCrudService';
import type {
  ApplicationServiceDeps,
  ApplicationServiceEnv,
  CreateUserApplicationInput,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
} from './ApplicationServiceTypes';

/**
 * Application CRUD facade used by the `/user/application*` routes.
 *
 * Mail-Bee does not wire Mail-Otter's rule suggestions or outbound integrations,
 * so those slices (and the AI/chat/digest services behind them) are gone rather
 * than kept alive by an unused constructor dependency. What remains is one
 * cohesive responsibility: the lifecycle of a user's own mailbox connection.
 */
class ApplicationService {
  private readonly crud: ApplicationCrudService;

  constructor(
    private readonly env: ApplicationServiceEnv,
    deps: ApplicationServiceDeps = {},
  ) {
    const db = env.DB;
    const masterKey = (): Promise<string> => env.AES_ENCRYPTION_KEY_SECRET.get();
    const full: Required<ApplicationServiceDeps> = {
      applicationDAO: async () => new ConnectedApplicationDAO(db, await masterKey()),
      contextDAO: () => Promise.resolve(new ApplicationContextDAO(db)),
      tokenCacheDAO: async () => new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE as KVNamespace, await masterKey()),
      watchService: () => Promise.resolve(new WatchService(env as WatchServiceEnv)),
      tokenService: () => Promise.resolve(new OAuth2AccessTokenService(env as OAuth2AccessTokenServiceEnv)),
      ...deps,
    };
    this.crud = new ApplicationCrudService(env, full);
  }

  public listUserApplications(scope: UserScope, raw: Request): Promise<ApplicationResponse[]> {
    return this.crud.listUserApplications(scope, raw);
  }

  public createUserApplication(scope: UserScope, input: CreateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.createUserApplication(scope, input, raw);
  }

  public updateUserApplication(scope: UserScope, input: UpdateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.updateUserApplication(scope, input, raw);
  }

  public updateWatchedFolderIds(scope: UserScope, input: UpdateWatchedFolderIdsInput, raw: Request): Promise<ApplicationResponse> {
    return this.crud.updateWatchedFolderIds(scope, input, raw);
  }

  public deleteUserApplication(scope: UserScope, applicationId: string): Promise<void> {
    return this.crud.deleteUserApplication(scope, applicationId);
  }

  public getOwnedApplication(scope: UserScope, applicationId: string) {
    return this.crud.getOwnedApplication(scope, applicationId);
  }

  public acknowledgeApplicationError(scope: UserScope, applicationId: string, errorType: 'processing' | 'context', raw: Request) {
    return this.crud.acknowledgeApplicationError(scope, applicationId, errorType, raw);
  }
}

const ApplicationServiceFactory = {
  create(env: ApplicationServiceEnv): ApplicationService {
    return new ApplicationService(env);
  },
};

export { ApplicationService, ApplicationServiceFactory };
