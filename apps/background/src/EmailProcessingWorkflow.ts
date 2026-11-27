import { AbstractWorkflowWorker } from '@mail-bee/backend-runtime/base';
import { createD1SessionEnv } from '@mail-bee/backend-data/utils';
import { ForwardingService } from '@mail-bee/backend-services/forwarding';
import type { ForwardOutcome, ResolvedForwarding } from '@mail-bee/backend-services/forwarding';
import { DatabaseError, NonRetryableError, OAuth2TokenNonRetryableError, RetryableError } from '@rexezuge/errors';
import { logTokenAdjacentError } from '@mail-bee/shared/utils';
import type { EmailQueueMessage } from '@mail-bee/shared/model';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError as WorkflowNonRetryableError } from 'cloudflare:workflows';

/**
 * Durable forwarding pipeline.
 *
 * Gmail notifications carry only a history id, so the first two steps discover
 * which message ids were added; Outlook notifications carry the message id
 * directly. Every forward is its own step so a transient provider or Email
 * Service failure retries without re-delivering messages already forwarded.
 */
class EmailProcessingWorkflow extends AbstractWorkflowWorker<EmailQueueMessage, EmailProcessingWorkflowResult> {
  protected async onWorkflow(
    event: Readonly<WorkflowEvent<EmailQueueMessage>>,
    step: WorkflowStep,
  ): Promise<EmailProcessingWorkflowResult> {
    const service = new ForwardingService(createD1SessionEnv(this.env));
    let forwarded = 0;

    const resolved: ResolvedForwarding = await step.do(
      'Resolve Mailbox',
      { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async (): Promise<ResolvedForwarding> => {
        try {
          return await service.resolve(event.payload.applicationId);
        } catch (error: unknown) {
          throw EmailProcessingWorkflow.toWorkflowError(error);
        }
      },
    );

    if (event.payload.type === 'gmail-notification') {
      const notification = event.payload;
      const list = await step.do(
        'List New Messages',
        { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
        async () => {
          try {
            return await service.listGmailMessages(resolved.application, notification.notificationHistoryId);
          } catch (error: unknown) {
            throw EmailProcessingWorkflow.toWorkflowError(error);
          }
        },
      );

      if (list) {
        for (const messageId of list.messageIds) {
          const outcome: ForwardOutcome = await step.do(
            `Forward Gmail Message ${messageId}`,
            { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
            async (): Promise<ForwardOutcome> => {
              try {
                return await service.forwardMessage(resolved, messageId);
              } catch (error: unknown) {
                throw EmailProcessingWorkflow.toWorkflowError(error);
              }
            },
          );
          if (outcome === 'forwarded') forwarded += 1;
        }

        await step.do(
          'Advance Gmail History',
          { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
          async (): Promise<void> => {
            try {
              await service.updateGmailHistory(list.subscriptionId, list.historyId);
            } catch (error: unknown) {
              throw EmailProcessingWorkflow.toWorkflowError(error);
            }
          },
        );
      }
    } else if (event.payload.type === 'outlook-notification') {
      const outlookMessageId: string = event.payload.messageId;
      const outcome: ForwardOutcome = await step.do(
        `Forward Outlook Message ${outlookMessageId}`,
        { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
        async (): Promise<ForwardOutcome> => {
          try {
            return await service.forwardMessage(resolved, outlookMessageId);
          } catch (error: unknown) {
            throw EmailProcessingWorkflow.toWorkflowError(error);
          }
        },
      );
      if (outcome === 'forwarded') forwarded += 1;
    }

    return { processed: true, applicationId: event.payload.applicationId, forwarded };
  }

  private static toWorkflowError(error: unknown): Error {
    if (error instanceof OAuth2TokenNonRetryableError) {
      logTokenAdjacentError('error', '[Workflow] OAuth2 token error (will retry via step policy)');
      return new RetryableError(error.message);
    }
    if (error instanceof NonRetryableError) {
      logTokenAdjacentError('error', '[Workflow] permanent failure');
      return new WorkflowNonRetryableError(error.message, error.name);
    }
    if (error instanceof RetryableError) {
      return error;
    }
    if (error instanceof DatabaseError) {
      if (!error.retryable) return new WorkflowNonRetryableError(error.message, 'DatabaseError');
      return new RetryableError(error.message);
    }
    return new RetryableError(error instanceof Error ? error.message : String(error));
  }

  /**
  Provider errors here can carry tokens or message bodies: log the class only.
  */
  protected override reportUnhandled(message: string): void {
    logTokenAdjacentError('error', message);
  }
}

interface EmailProcessingWorkflowResult {
  processed: boolean;
  applicationId: string;
  forwarded: number;
}

export { EmailProcessingWorkflow };
export type { EmailProcessingWorkflowResult };
