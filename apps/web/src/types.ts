export type ProviderId = 'google-gmail' | 'microsoft-outlook';

export type ConnectionMethod = 'oauth2';

export type ApplicationStatus = 'draft' | 'connected' | 'error';

export type WatchStatus = 'none' | 'active' | 'stopped' | 'error';

export type CurrentUser = {
  email: string;
};

export type ApplicationDto = {
  applicationId: string;
  displayName: string;
  providerId: ProviderId;
  providerEmail?: string | null;
  status: ApplicationStatus;
  connectionMethod: ConnectionMethod;
  gmailPubsubTopicName?: string | null;
  createdAt: number;
  updatedAt: number;
  watchStatus?: WatchStatus;
  webhookUrl?: string | null;
  watchExpiresAt?: number | null;
  lastError?: string | null;
  forwardedCount?: number;
};

export type ForwardedMessageDto = {
  processedMessageId: string;
  applicationId: string;
  providerMessageId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string | null;
};

export type ApplicationFormValues = {
  displayName: string;
  providerId: ProviderId;
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName: string;
};
