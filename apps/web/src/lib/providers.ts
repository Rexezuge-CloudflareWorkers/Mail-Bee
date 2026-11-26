import type { ProviderId } from '../types';

export const providerIds: readonly ProviderId[] = ['google-gmail', 'microsoft-outlook'];

export const providerLabels: Record<ProviderId, string> = {
  'google-gmail': 'Google Gmail',
  'microsoft-outlook': 'Microsoft Outlook',
};
