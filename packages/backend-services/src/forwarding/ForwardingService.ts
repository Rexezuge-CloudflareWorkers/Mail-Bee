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
import {
  NonRetryableError,
  OAuth2TokenNonRetryableError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
  RetryableError,
} from '@rexezuge/errors';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AccessTokenServiceEnv } from '../oauth2/OAuth2AccessTokenService';
import { bareAddress, buildForwardedMime } from './ForwardedMime';

/**
Email Service rejects messages larger than 25 MiB, headers included.
*/
const MAX_FORWARD_BYTES = 25 * 1024 * 1024;

/**
 * A workflow step can retry for a couple of minutes (`30s` then `60s` then
 * `120s`), so the token handed to it must stay valid for longer than the
 * default 60-second window.
 */
const FORWARDING_TOKEN_MIN_VALID_SECONDS = 300;

/**
 * Email Service codes where another attempt can succeed. Every other code is a
 * permanent rejection: retrying a header/validation/recipient failure just
 * repeats it forever and hides the real error from the forwarding log.
 */
const RETRYABLE_EMAIL_SEND_CODES: ReadonlySet<string> = new Set([
  'E_RATE_LIMIT_EXCEEDED',
  'E_DAILY_LIMIT_EXCEEDED',
  'E_INTERNAL_SERVER_ERROR',
  'E_DELIVERY_FAILED',
  'E_EMAIL_SENDING_NOT_READY',
]);

/**
 * The provider no longer has the message: it was deleted, or moved somewhere
 * where the notification's id no longer resolves. Retrying cannot help.
 */
const MESSAGE_GONE_HTTP_STATUSES: ReadonlySet<number> = new Set([404, 410]);

const FORWARDING_RECIPIENT_PATTERN: RegExp = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

interface ResolvedForwarding {
  application: ConnectedApplication;
  recipient: string;
}

interface GmailMessageList {
  messageIds: string[];
  historyId: string;
  subscriptionId: string;
}

type ForwardOutcome = 'forwarded' | 'duplicate' | 'skipped';

type ForwardingStage = 'fetch' | 'send' | 'record';

/**
 * The product feature: take a message id from a provider webhook, fetch the
 * original RFC 5322 bytes, and hand them to Cloudflare Email Sending.
 *
 * The body, attachments and their encodings are forwarded byte-for-byte. The
 * top-level header block is rebuilt by `buildForwardedMime`: Email Sending
 * requires the MIME `From` to equal the envelope sender, rejects `Received`,
 * and requires a `Message-ID`, none of which a stored provider message reliably
 * satisfies.
 *
 * The three phases (fetch, send, record) are handled separately on purpose. A
 * provider fetch failure is not a send failure, a permanent provider error must
 * not be retried forever, and a bookkeeping write that fails after
 * `EMAIL.send()` returned must never turn into a second delivery.
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

    // `user_email` is the frozen anchor. The sign-in address may have moved, so
    // read the mutable current address from the account itself. An empty
    // `current_email` must fall back to the anchor rather than produce an
    // invalid recipient that `new EmailMessage()` rejects with a typeless error.
    const userRow = await new UserDAO(this.env.DB).getRowByEmail(application.userEmail);
    const recipient: string = (userRow?.current_email?.trim() || application.userEmail).toLowerCase();
    if (!FORWARDING_RECIPIENT_PATTERN.test(recipient)) {
      throw new NonRetryableError('The account has no valid forwarding recipient.');
    }

    // The access token is deliberately not returned: it would be persisted in
    // durable workflow state between steps. Each step resolves a fresh one.
    return { application, recipient };
  }

  public async listGmailMessages(application: ConnectedApplication, notificationHistoryId: string): Promise<GmailMessageList | null> {
    const subscription: ProviderSubscription | undefined = await new ProviderSubscriptionDAO(this.env.DB).getByApplication(
      application.applicationId,
    );
    if (!subscription || subscription.status !== PROVIDER_SUBSCRIPTION_STATUS_ACTIVE) {
      return null;
    }
    const accessToken: string = await this.accessToken(application.applicationId);
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
    const { application, recipient } = resolved;
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

    let raw: string;
    try {
      const accessToken: string = await this.accessToken(application.applicationId);
      raw = await this.fetchRaw(application, accessToken, providerMessageId);
    } catch (error: unknown) {
      return this.handleFetchFailure(processedDAO, application, providerMessageId, error);
    }

    let sender: string;
    let forwarded: string;
    try {
      sender = this.sender();
      forwarded = buildForwardedMime(raw, {
        envelopeFrom: sender,
        recipient,
        mailbox: application.providerEmail ?? application.applicationId,
      });
    } catch (error: unknown) {
      return this.handleSendFailure(processedDAO, application.applicationId, providerMessageId, error);
    }

    const byteLength: number = new TextEncoder().encode(forwarded).byteLength;
    if (byteLength > MAX_FORWARD_BYTES) {
      await processedDAO.markSkipped(
        application.applicationId,
        providerMessageId,
        `Message is ${byteLength} bytes; Email Service accepts at most ${MAX_FORWARD_BYTES} bytes.`,
      );
      return 'skipped';
    }

    try {
      const { EmailMessage } = await import('cloudflare:email');
      await this.env.EMAIL.send(new EmailMessage(sender, recipient, forwarded));
    } catch (error: unknown) {
      return this.handleSendFailure(processedDAO, application.applicationId, providerMessageId, error);
    }

    // The message is delivered at this point. Bookkeeping failures must retry
    // only the write: throwing here would re-run the send and duplicate the
    // forward in the recipient's inbox.
    await this.recordForwarded(processedDAO, application.applicationId, providerMessageId);
    return 'forwarded';
  }

  private async accessToken(applicationId: string): Promise<string> {
    return this.tokens.getAccessToken(applicationId, { minValidSeconds: FORWARDING_TOKEN_MIN_VALID_SECONDS });
  }

  private async handleFetchFailure(
    processedDAO: ProcessedMessageDAO,
    application: ConnectedApplication,
    providerMessageId: string,
    error: unknown,
  ): Promise<ForwardOutcome> {
    if (this.isMessageGone(application, error)) {
      const goneStatus: string = providerStatus(error)?.toString() ?? errorName(error);
      await this.record(processedDAO, application.applicationId, providerMessageId, () =>
        processedDAO.markSkipped(application.applicationId, providerMessageId, `fetch:E_PROVIDER_MESSAGE_GONE:${goneStatus}`),
      );
      logTokenAdjacentError('warn', '[Forwarding] provider message no longer available; skipped', {
        applicationId: application.applicationId,
        providerMessageId,
        stage: 'fetch',
        httpStatus: String(providerStatus(error) ?? ''),
      });
      return 'skipped';
    }

    const retryable: boolean = isRetryableFailure(error);
    await this.recordFailure(processedDAO, application.applicationId, providerMessageId, 'fetch', error);
    logTokenAdjacentError('error', `[Forwarding] raw message fetch failed (${retryable ? 'retryable' : 'permanent'})`, {
      applicationId: application.applicationId,
      providerMessageId,
      stage: 'fetch',
      code: errorCode(error) ?? '',
      httpStatus: String(providerStatus(error) ?? ''),
      errorName: errorName(error),
    });
    throw retryable
      ? new RetryableError('Forwarding fetch failed; will retry.')
      : new NonRetryableError('Forwarding fetch failed permanently.');
  }

  private async handleSendFailure(
    processedDAO: ProcessedMessageDAO,
    applicationId: string,
    providerMessageId: string,
    error: unknown,
  ): Promise<never> {
    const code: string | undefined = errorCode(error);
    const permanent: boolean =
      error instanceof NonRetryableError || error instanceof TypeError || (code !== undefined && !RETRYABLE_EMAIL_SEND_CODES.has(code));

    await this.recordFailure(processedDAO, applicationId, providerMessageId, 'send', error);
    // Token-adjacent: never interpolate the caught error, which can carry a
    // bearer token or the raw message body. The failure is persisted above.
    logTokenAdjacentError('error', `[Forwarding] send failed (${permanent ? 'permanent' : 'retryable'})`, {
      applicationId,
      providerMessageId,
      stage: 'send',
      code: code ?? '',
      errorName: errorName(error),
    });
    throw permanent
      ? new NonRetryableError(`Email Sending refused the message (${code ?? errorName(error)}).`)
      : new RetryableError('Forwarding failed; will retry.');
  }

  private async recordForwarded(processedDAO: ProcessedMessageDAO, applicationId: string, providerMessageId: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await processedDAO.markSummarized(applicationId, providerMessageId);
        return;
      } catch {
        // Retry the write once; the send itself must not run again.
      }
    }
    logTokenAdjacentError('error', '[Forwarding] message sent but recording the outcome failed', {
      applicationId,
      providerMessageId,
      stage: 'record',
    });
  }

  private async recordFailure(
    processedDAO: ProcessedMessageDAO,
    applicationId: string,
    providerMessageId: string,
    stage: ForwardingStage,
    error: unknown,
  ): Promise<void> {
    await this.record(processedDAO, applicationId, providerMessageId, () =>
      processedDAO.markError(applicationId, providerMessageId, ForwardingService.failureReason(stage, error)),
    );
  }

  private async record(
    processedDAO: ProcessedMessageDAO,
    applicationId: string,
    providerMessageId: string,
    write: () => Promise<void>,
  ): Promise<void> {
    try {
      await write();
    } catch {
      // A failed status write must not mask the original failure (or replace a
      // retryable classification with a database error).
      logTokenAdjacentError('error', '[Forwarding] failed to record forwarding outcome', {
        applicationId,
        providerMessageId,
      });
    }
  }

  /**
   * A machine-readable reason stored in `processed_messages.error_message`.
   * Never the caught message: provider errors can carry mailbox contents.
   */
  private static failureReason(stage: ForwardingStage, error: unknown): string {
    const reason: string = errorCode(error) ?? providerStatus(error)?.toString() ?? errorName(error);
    return `${stage}:${reason || 'unknown'}`;
  }

  private isMessageGone(application: ConnectedApplication, error: unknown): boolean {
    const status: number | undefined = providerStatus(error);
    if (status !== undefined && MESSAGE_GONE_HTTP_STATUSES.has(status)) {
      return true;
    }
    return application.providerId === PROVIDER_GOOGLE_GMAIL
      ? GmailProviderUtil.isMessageNotFoundError(error)
      : OutlookProviderUtil.isMessageNotFoundError(error);
  }

  private sender(): string {
    const configured: string | undefined = this.env.SEND_FROM;
    if (!configured) {
      throw new NonRetryableError('SEND_FROM is not configured. Set it to an address on an onboarded sending domain.');
    }
    return bareAddress(configured);
  }

  private async fetchRaw(application: ConnectedApplication, accessToken: string, providerMessageId: string): Promise<string> {
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      return GmailProviderUtil.getRawMessage(accessToken, providerMessageId);
    }
    return OutlookProviderUtil.getRawMessage(accessToken, providerMessageId);
  }
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && code ? code : undefined;
}

/**
 * Only provider errors carry a meaningful HTTP status. The base error classes
 * default to 400/502, which must not be logged as an upstream status.
 */
function providerStatus(error: unknown): number | undefined {
  if (error instanceof ProviderApiNonRetryableError || error instanceof ProviderApiRetryableError) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function isRetryableFailure(error: unknown): boolean {
  if (error instanceof RetryableError) return true;
  // The workflow deliberately retries token-policy failures once more in case
  // the token worker's cached grant has caught up. Keep that policy here.
  if (error instanceof OAuth2TokenNonRetryableError) return true;
  if (error instanceof NonRetryableError) return false;
  const retryable = (error as { retryable?: unknown })?.retryable;
  if (typeof retryable === 'boolean') return retryable;
  return true;
}

interface ForwardingServiceEnv extends OAuth2AccessTokenServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  EMAIL: SendEmail;
  SEND_FROM?: string;
}

export { ForwardingService, MAX_FORWARD_BYTES };
export type { ForwardOutcome, ForwardingServiceEnv, GmailMessageList, ResolvedForwarding };
