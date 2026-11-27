import type { D1Queryable } from '@mail-bee/backend-data/utils';
import { BadRequestError, UnauthorizedError } from '@rexezuge/errors';
import type { EmailQueueMessage } from '@mail-bee/shared/model';
import { WebhookSecurityUtil } from '@mail-bee/provider-clients/webhook';
import { BaseWebhookService } from './BaseWebhookService';

class GmailWebhookService extends BaseWebhookService {
  public static async handleNotification(input: GmailWebhookInput, env: GmailWebhookEnv): Promise<void> {
    const { dao: subscriptionDAO, subscription } = await this.getSubscriptionByApplication(env.DB, input.applicationId);
    if (!subscription || !(await this.matchesSecret(input.token, subscription.webhookSecretHash))) {
      throw new UnauthorizedError('Invalid Gmail webhook token.');
    }
    const decoded: GmailNotificationData = this.decodeNotification(input.messageData);
    await this.enqueueAndTouch(env.EMAIL_EVENTS_QUEUE, subscriptionDAO, subscription.subscriptionId, {
      type: 'gmail-notification',
      applicationId: input.applicationId,
      notificationHistoryId: decoded.historyId,
      pubsubMessageId: input.pubsubMessageId,
      callbackBaseUrl: input.callbackBaseUrl,
    });
  }

  /**
   * Pub/Sub payloads are untrusted bytes even when the token matched: a
   * malformed body must be a 400 the provider can discard, not a 500 that
   * triggers retries of a permanently broken notification.
   */
  private static decodeNotification(messageData: string): GmailNotificationData {
    let decoded: unknown;
    try {
      decoded = JSON.parse(WebhookSecurityUtil.base64UrlDecodeToString(messageData));
    } catch {
      throw new BadRequestError('Gmail notification payload is not valid base64-encoded JSON.');
    }
    if (typeof decoded !== 'object' || decoded === null) {
      throw new BadRequestError('Gmail notification payload is not a JSON object.');
    }
    const historyId: unknown = (decoded as { historyId?: unknown }).historyId;
    if (typeof historyId !== 'string' || !historyId.trim()) {
      throw new BadRequestError('Gmail notification was missing historyId.');
    }
    return { historyId };
  }
}

interface GmailWebhookInput {
  applicationId: string;
  token: string | null;
  messageData: string;
  pubsubMessageId?: string;
  callbackBaseUrl?: string;
}

interface GmailNotificationData {
  emailAddress?: string;
  // Validated by `decodeNotification` before any message reaches the queue.
  historyId: string;
}

interface GmailWebhookEnv {
  DB: D1Queryable;
  EMAIL_EVENTS_QUEUE: Queue<EmailQueueMessage>;
}

export { GmailWebhookService };
export type { GmailWebhookEnv, GmailWebhookInput, GmailNotificationData };
