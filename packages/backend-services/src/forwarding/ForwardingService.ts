import type { D1Queryable } from '@mail-bee/backend-data/utils';
import { ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO, UserDAO } from '@mail-bee/backend-data/dao';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
} from '@mail-bee/shared/constants';
import type { ConnectedApplication, ProviderSubscription } from '@mail-bee/shared/model';
import { GmailProviderUtil } from '@mail-bee/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-bee/provider-clients/outlook';
import { logTokenAdjacentError } from '@mail-bee/shared/utils';
import { NonRetryableError, RetryableError } from '@rexezuge/errors';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AccessTokenServiceEnv } from '../oauth2/OAuth2AccessTokenService';

/**
Email Service rejects messages larger than 25 MiB, headers included.
*/
const MAX_FORWARD_BYTES = 25 * 1024 * 1024;

interface ResolvedForwarding {
  application: ConnectedApplication;
  accessToken: string;
  recipient: string;
}

interface GmailMessageList {
  messageIds: string[];
  historyId: string;
  subscriptionId: string;
}

type ForwardOutcome = 'forwarded' | 'duplicate' | 'skipped';

/**
 * The product feature: take a message id from a provider webhook, fetch the
 * original RFC 5322 bytes, and hand them to Cloudflare Email Sending.
 *
 * Nothing here summarises or rewrites the body. The only modification is a pair
 * of `X-Mail-Bee-*` tracing headers, which every mail transport is allowed to
 * add and which makes a forwarded copy identifiable in the recipient's inbox.
 */
class ForwardingService {
  private readonly tokens: OAuth2AccessTokenService;

  constructor(private readonly env: ForwardingServiceEnv) {
    this.tokens = new OAuth2AccessTokenService(env);
  }

  public async resolve(applicationId: string): Promise<ResolvedForwarding> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(applicationId);
    if (!application) {
      throw new NonRetryableError('Connected application was not found for the webhook event.');
    }
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new NonRetryableError('Connected application is not authorized to read mail.');
    }

    const accessToken: string = await this.tokens.getAccessToken(applicationId);
    // `user_email` is the frozen anchor. The sign-in address may have moved, so
    // read the mutable current address from the account itself.
    const userRow = await new UserDAO(this.env.DB).getRowByEmail(application.userEmail);
    const recipient: string = (userRow?.current_email ?? application.userEmail).toLowerCase();
    return { application, accessToken, recipient };
  }

  public async listGmailMessages(
    application: ConnectedApplication,
    accessToken: string,
    notificationHistoryId: string,
  ): Promise<GmailMessageList | null> {
    const subscription: ProviderSubscription | undefined = await new ProviderSubscriptionDAO(this.env.DB).getByApplication(
      application.applicationId,
    );
    if (!subscription || subscription.status !== PROVIDER_SUBSCRIPTION_STATUS_ACTIVE) {
      return null;
    }
    const history = await GmailProviderUtil.listMessageIdsSince(accessToken, subscription.gmailHistoryId || notificationHistoryId);
    return {
      messageIds: history.messageIds,
      historyId: history.historyId || notificationHistoryId,
      subscriptionId: subscription.subscriptionId,
    };
  }

  public async updateGmailHistory(subscriptionId: string, historyId: string): Promise<void> {
    await new ProviderSubscriptionDAO(this.env.DB).updateGmailHistory(subscriptionId, historyId);
  }

  public async forwardMessage(
    resolved: ResolvedForwarding,
    providerMessageId: string,
    providerThreadId?: string | null,
  ): Promise<ForwardOutcome> {
    const { application, accessToken, recipient } = resolved;
    const processedDAO = new ProcessedMessageDAO(this.env.DB);
    const started: boolean = await processedDAO.tryStart(
      application.applicationId,
      application.providerId,
      providerMessageId,
      providerThreadId,
      { allowExistingForRetry: true },
    );
    if (!started) {
      return 'duplicate';
    }

    try {
      const raw: string = await this.fetchRaw(application, accessToken, providerMessageId);
      const byteLength: number = new TextEncoder().encode(raw).byteLength;
      if (byteLength > MAX_FORWARD_BYTES) {
        await processedDAO.markSkipped(
          application.applicationId,
          providerMessageId,
          `Message is ${byteLength} bytes; Email Service accepts at most ${MAX_FORWARD_BYTES} bytes.`,
        );
        return 'skipped';
      }

      const traced: string = [
        'X-Mail-Bee-Forwarded: yes',
        `X-Mail-Bee-Mailbox: ${application.providerEmail ?? application.applicationId}`,
        raw,
      ].join('\r\n');

      const { EmailMessage } = await import('cloudflare:email');
      await this.env.EMAIL.send(new EmailMessage(this.sender(), recipient, traced));
      await processedDAO.markSummarized(application.applicationId, providerMessageId);
      return 'forwarded';
    } catch (error: unknown) {
      const code: string | undefined = (error as { code?: string })?.code;
      const permanent: boolean =
        code === 'E_RECIPIENT_PLAN_RESTRICTED' || code === 'E_RECIPIENT_NOT_ALLOWED' || code === 'E_SENDER_NOT_VERIFIED';
      // Token-adjacent: never interpolate the caught error, which can carry a
      // bearer token or the raw message body. The failure is persisted above.
      logTokenAdjacentError('error', `[Forwarding] send failed (${permanent ? 'permanent' : 'retryable'})`, {
        applicationId: application.applicationId,
        providerMessageId,
        code: code ?? '',
      });
      await processedDAO.markError(application.applicationId, providerMessageId, code ?? 'forwarding failed');
      throw permanent
        ? new NonRetryableError(`Email Sending refused the recipient (${code ?? 'unknown'}).`)
        : new RetryableError('Forwarding failed; will retry.');
    }
  }

  private sender(): string {
    const configured: string | undefined = this.env.SEND_FROM;
    if (!configured) {
      throw new NonRetryableError('SEND_FROM is not configured. Set it to an address on an onboarded sending domain.');
    }
    return configured;
  }

  private async fetchRaw(application: ConnectedApplication, accessToken: string, providerMessageId: string): Promise<string> {
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      return GmailProviderUtil.getRawMessage(accessToken, providerMessageId);
    }
    return OutlookProviderUtil.getRawMessage(accessToken, providerMessageId);
  }
}

interface ForwardingServiceEnv extends OAuth2AccessTokenServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  EMAIL: SendEmail;
  SEND_FROM?: string;
}

export { ForwardingService, MAX_FORWARD_BYTES };
export type { ForwardOutcome, ForwardingServiceEnv, GmailMessageList, ResolvedForwarding };
