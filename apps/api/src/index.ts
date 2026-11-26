import { EmailEventsDispatcherWorker } from '@mail-bee/background';
import { MailBeeWorker } from '@/workers';
import type { EmailQueueMessage } from '@mail-bee/shared/model';
export { CronTasksWorker, EmailProcessingWorkflow, OAuth2TokenRefreshWorker } from '@mail-bee/background';

const mailBeeWorker: MailBeeWorker = new MailBeeWorker();
const emailEventsDispatcherWorker: EmailEventsDispatcherWorker = new EmailEventsDispatcherWorker();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return mailBeeWorker.fetch(request, env, ctx);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return mailBeeWorker.scheduled(controller, env, ctx);
  },
  /**
  The queue binding is untyped; this Worker is both producer and consumer.
  */
  queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    return emailEventsDispatcherWorker.queue(batch as MessageBatch<EmailQueueMessage>, env, ctx);
  },
};
