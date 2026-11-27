import { AppConfiguration } from './AppConfiguration';

/**
 * One instance config per env object. The facade's static call sites predate
 * dependency injection; memoizing keeps them cheap while making
 * {@link AppConfiguration} the only place that knows a binding name or a
 * default value.
 */
const instances = new WeakMap<object, AppConfiguration>();

function config(env: unknown): AppConfiguration {
  if (typeof env !== 'object' || env === null) return new AppConfiguration(env);
  let instance: AppConfiguration | undefined = instances.get(env);
  if (!instance) {
    instance = new AppConfiguration(env);
    instances.set(env, instance);
  }
  return instance;
}

/**
 * Static compatibility facade over the SDK-backed {@link AppConfiguration}.
 *
 * Env parsing used to live here as well as in the instance config, so a new
 * binding could be added to one and silently missing from the other. Every
 * getter below now delegates to the same instance surface; new services should
 * inject `AppConfiguration` directly instead of calling these statics.
 */
class ConfigurationManager {
  // ─── Namespace groups ────────────────────────────────────────────────────────

  public static readonly ai = {
    getSummaryModel: (env: unknown): string => config(env).getSummaryModel(),
    getSummaryFallbackModel: (env: unknown): string => config(env).getSummaryFallbackModel(),
    getEmbeddingModel: (env: unknown): string => config(env).getEmbeddingModel(),
    getDailyNeuronFallbackThreshold: (env: unknown): number => config(env).getAiDailyNeuronFallbackThreshold(),
    getDailyNeuronFreeTierLimit: (env: unknown): number => config(env).getAiDailyNeuronFreeTierLimit(),
    getDailyUsageRetentionDays: (env: unknown): number => config(env).getAiDailyUsageRetentionDays(),
    isAttachmentVisionEnabled: (env: unknown): boolean => config(env).isAttachmentVisionEnabled(),
    getAttachmentVisionModel: (env: unknown): string => config(env).getAttachmentVisionModel(),
  };

  public static readonly attachment = {
    getMaxSizeBytes: (env: unknown): number => config(env).getMaxAttachmentSizeBytes(),
    getMaxPerEmail: (env: unknown): number => config(env).getMaxAttachmentsPerEmail(),
  };

  public static readonly oauth2 = {
    getStateExpiryMinutes: (env: unknown): number => config(env).getOauth2StateExpiryMinutes(),
    getAccessTokenRefreshWindowSeconds: (env: unknown): number => config(env).getAccessTokenRefreshWindowSeconds(),
    getAccessTokenMinValidSeconds: (env: unknown): number => config(env).getAccessTokenMinValidSeconds(),
    getAccessTokenFallbackTtlSeconds: (env: unknown): number => config(env).getAccessTokenFallbackTtlSeconds(),
    getTokenRefreshBatchSize: (env: unknown): number => config(env).getTokenRefreshBatchSize(),
  };

  public static readonly context = {
    getMaxEmailBodyChars: (env: unknown): number => config(env).getMaxEmailBodyChars(),
    getMaxContextMemoryChars: (env: unknown): number => config(env).getMaxContextMemoryChars(),
    getMaxRagContextChars: (env: unknown): number => config(env).getMaxRagContextChars(),
    getRagTopK: (env: unknown): number => config(env).getRagTopK(),
    getRagVectorQueryTopK: (env: unknown): number => config(env).getRagVectorQueryTopK(),
    getMaxDocumentsPerApplication: (env: unknown): number => config(env).getMaxDocumentsPerApplication(),
    getDeletionRunRetentionDays: (env: unknown): number => config(env).getContextDeletionRunRetentionDays(),
    getAuditLogRetentionDays: (env: unknown): number => config(env).getContextAuditLogRetentionDays(),
    getStaleDocumentDeletedGraceDays: (env: unknown): number => config(env).getStaleDocumentDeletedGraceDays(),
    getStaleDocumentErrorGraceDays: (env: unknown): number => config(env).getStaleDocumentErrorGraceDays(),
  };

  public static readonly subscription = {
    getGmailRenewalWindowHours: (env: unknown): number => config(env).getGmailWatchRenewalWindowHours(),
    getOutlookRenewalWindowHours: (env: unknown): number => config(env).getOutlookRenewalWindowHours(),
    getOutlookTtlDays: (env: unknown): number => config(env).getOutlookTtlDays(),
    getRenewalRetryBaseDelaySeconds: (env: unknown): number => config(env).getRenewalRetryBaseDelaySeconds(),
    getRenewalRetryMaxDelaySeconds: (env: unknown): number => config(env).getRenewalRetryMaxDelaySeconds(),
  };

  public static readonly baseUrl = {
    getPublicBaseUrl: (env: unknown): string => config(env).getPublicBaseUrl(),
  };

  public static readonly action = {
    getCallbackBaseUrl: (env: unknown): string => config(env).getActionCallbackBaseUrl(),
    getDefaultExpiryHours: (env: unknown): number => config(env).getActionDefaultExpiryHours(),
    getRetentionDays: (env: unknown): number => config(env).getActionRetentionDays(),
  };

  public static readonly limits = {
    getMaxApplicationsPerUser: (env: unknown): number => config(env).getMaxApplicationsPerUser(),
    getProcessedMessageRetentionDays: (env: unknown): number => config(env).getProcessedMessageRetentionDays(),
  };

  public static readonly integrations = {
    getDeliveryLogRetentionDays: (env: unknown): number => config(env).getIntegrationDeliveryLogRetentionDays(),
  };

  public static readonly digest = {
    getPackageTrackingApiKey: (env: unknown): string => config(env).getPackageTrackingApiKey(),
    getFlightTrackingApiKey: (env: unknown): string => config(env).getFlightTrackingApiKey(),
  };

  public static readonly tracking = {
    getPackageTrackingApiKey: (env: unknown): string => config(env).getPackageTrackingApiKey(),
    getFlightTrackingApiKey: (env: unknown): string => config(env).getFlightTrackingApiKey(),
  };

  public static readonly processing = {
    getTaskRunRetentionDays: (env: unknown): number => config(env).getTaskRunRetentionDays(),
  };

  public static readonly drive = {
    getMaxFilesPerSync: (env: unknown): number => config(env).getMaxDriveFilesPerSync(),
  };

  public static readonly chat = {
    getMaxResponseTokens: (env: unknown): number => config(env).getChatMaxResponseTokens(),
    getVectorQueryTopK: (env: unknown): number => config(env).getChatVectorQueryTopK(),
    getContextTopK: (env: unknown): number => config(env).getChatContextTopK(),
    getMaxHistoryMessages: (env: unknown): number => config(env).getChatMaxHistoryMessages(),
  };

  // ─── Flat API (backward-compatible, delegates to namespace groups) ────────────

  public static getMaxApplicationsPerUser(env: unknown): number {
    return this.limits.getMaxApplicationsPerUser(env);
  }
  public static getDebugMode(env: unknown): boolean {
    return config(env).getDebugMode();
  }
  public static getOauth2StateExpiryMinutes(env: unknown): number {
    return this.oauth2.getStateExpiryMinutes(env);
  }
  public static getGmailWatchRenewalWindowHours(env: unknown): number {
    return this.subscription.getGmailRenewalWindowHours(env);
  }
  public static getOutlookSubscriptionRenewalWindowHours(env: unknown): number {
    return this.subscription.getOutlookRenewalWindowHours(env);
  }
  public static getOutlookSubscriptionTtlDays(env: unknown): number {
    return this.subscription.getOutlookTtlDays(env);
  }
  public static getEmailSummaryModel(env: unknown): string {
    return this.ai.getSummaryModel(env);
  }
  public static getEmailSummaryFallbackModel(env: unknown): string {
    return this.ai.getSummaryFallbackModel(env);
  }
  public static getAiDailyNeuronFallbackThreshold(env: unknown): number {
    return this.ai.getDailyNeuronFallbackThreshold(env);
  }
  public static getAiDailyNeuronFreeTierLimit(env: unknown): number {
    return this.ai.getDailyNeuronFreeTierLimit(env);
  }
  public static getMaxEmailBodyChars(env: unknown): number {
    return this.context.getMaxEmailBodyChars(env);
  }
  public static getAiEmbeddingModel(env: unknown): string {
    return this.ai.getEmbeddingModel(env);
  }
  public static getRagTopK(env: unknown): number {
    return this.context.getRagTopK(env);
  }
  public static getRagVectorQueryTopK(env: unknown): number {
    return this.context.getRagVectorQueryTopK(env);
  }
  public static getMaxContextMemoryChars(env: unknown): number {
    return this.context.getMaxContextMemoryChars(env);
  }
  public static getMaxRagContextChars(env: unknown): number {
    return this.context.getMaxRagContextChars(env);
  }
  public static getOAuth2AccessTokenRefreshWindowSeconds(env: unknown): number {
    return this.oauth2.getAccessTokenRefreshWindowSeconds(env);
  }
  public static getOAuth2AccessTokenMinValidSeconds(env: unknown): number {
    return this.oauth2.getAccessTokenMinValidSeconds(env);
  }
  public static getOAuth2AccessTokenFallbackTtlSeconds(env: unknown): number {
    return this.oauth2.getAccessTokenFallbackTtlSeconds(env);
  }
  public static getOAuth2TokenRefreshBatchSize(env: unknown): number {
    return this.oauth2.getTokenRefreshBatchSize(env);
  }
  public static getRenewalRetryBaseDelaySeconds(env: unknown): number {
    return this.subscription.getRenewalRetryBaseDelaySeconds(env);
  }
  public static getRenewalRetryMaxDelaySeconds(env: unknown): number {
    return this.subscription.getRenewalRetryMaxDelaySeconds(env);
  }
  public static getMaxContextDocumentsPerApplication(env: unknown): number {
    return this.context.getMaxDocumentsPerApplication(env);
  }
  public static getProcessedMessageRetentionDays(env: unknown): number {
    return this.limits.getProcessedMessageRetentionDays(env);
  }
  public static getStaleContextDocumentDeletedGraceDays(env: unknown): number {
    return this.context.getStaleDocumentDeletedGraceDays(env);
  }
  public static getStaleContextDocumentErrorGraceDays(env: unknown): number {
    return this.context.getStaleDocumentErrorGraceDays(env);
  }
  public static getContextDeletionRunRetentionDays(env: unknown): number {
    return this.context.getDeletionRunRetentionDays(env);
  }
  public static getAiDailyUsageRetentionDays(env: unknown): number {
    return this.ai.getDailyUsageRetentionDays(env);
  }
  public static getActionCallbackBaseUrl(env: unknown): string {
    return this.action.getCallbackBaseUrl(env);
  }
  public static getActionDefaultExpiryHours(env: unknown): number {
    return this.action.getDefaultExpiryHours(env);
  }
  public static getActionRetentionDays(env: unknown): number {
    return this.action.getRetentionDays(env);
  }
  public static getContextAuditLogRetentionDays(env: unknown): number {
    return this.context.getAuditLogRetentionDays(env);
  }
  public static getIntegrationDeliveryLogRetentionDays(env: unknown): number {
    return this.integrations.getDeliveryLogRetentionDays(env);
  }
  public static getPublicBaseUrl(env: unknown): string {
    return this.baseUrl.getPublicBaseUrl(env);
  }
  public static getPackageTrackingApiKey(env: unknown): string {
    return this.tracking.getPackageTrackingApiKey(env);
  }
  public static getFlightTrackingApiKey(env: unknown): string {
    return this.tracking.getFlightTrackingApiKey(env);
  }
  public static getMaxDriveFilesPerSync(env: unknown): number {
    return this.drive.getMaxFilesPerSync(env);
  }
  public static getChatMaxResponseTokens(env: unknown): number {
    return this.chat.getMaxResponseTokens(env);
  }
  public static getChatVectorQueryTopK(env: unknown): number {
    return this.chat.getVectorQueryTopK(env);
  }
  public static getChatContextTopK(env: unknown): number {
    return this.chat.getContextTopK(env);
  }
  public static getChatMaxHistoryMessages(env: unknown): number {
    return this.chat.getMaxHistoryMessages(env);
  }
  public static getMaxAttachmentSizeBytes(env: unknown): number {
    return this.attachment.getMaxSizeBytes(env);
  }
  public static getMaxAttachmentsPerEmail(env: unknown): number {
    return this.attachment.getMaxPerEmail(env);
  }
}

export { ConfigurationManager };
