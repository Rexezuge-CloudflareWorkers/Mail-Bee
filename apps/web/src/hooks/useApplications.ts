import { useCallback, useEffect, useState } from 'react';
import type { ShowNotice } from '@rexezuge/web';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { errorMessage } from '../lib/errors';
import type { ApplicationDto, ApplicationFormValues } from '../types';

type UseApplicationsOptions = {
  showNotice: ShowNotice;
};

export function useApplications({ showNotice }: UseApplicationsOptions) {
  const [applications, setApplications] = useState<ApplicationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadApplications = useCallback(async () => {
    try {
      const data = await apiGet<{ applications: ApplicationDto[] }>('/user/applications');
      setApplications(data.applications);
    } catch (error) {
      showNotice('error', errorMessage(error, 'Unable to load mailboxes.'));
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    // Initial fetch is the external-system read this effect synchronizes; both
    // state updates happen after the network request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadApplications();
  }, [loadApplications]);

  const createApplication = async (values: ApplicationFormValues): Promise<boolean> => {
    setBusy(true);
    try {
      const topic = values.gmailPubsubTopicName.trim();
      const gmailOptions = values.providerId === 'google-gmail' && topic ? { gmailPubsubTopicName: topic } : {};
      const payload = {
        displayName: values.displayName.trim(),
        providerId: values.providerId,
        connectionMethod: 'oauth2' as const,
        clientId: values.clientId.trim(),
        clientSecret: values.clientSecret.trim(),
        ...gmailOptions,
      };
      const { application } = await apiPost<{ application: ApplicationDto }>('/user/application', payload);
      setApplications((current) => [...current, application]);
      showNotice('success', `Mailbox "${application.displayName}" created.`);
      return true;
    } catch (error) {
      showNotice('error', errorMessage(error, 'Unable to create mailbox.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteApplication = async (applicationId: string) => {
    setBusy(true);
    try {
      await apiDelete<{ deleted: true }>('/user/application', { applicationId });
      setApplications((current) => current.filter((app) => app.applicationId !== applicationId));
      showNotice('success', 'Mailbox deleted.');
    } catch (error) {
      showNotice('error', errorMessage(error, 'Unable to delete mailbox.'));
    } finally {
      setBusy(false);
    }
  };

  const authorize = async (applicationId: string) => {
    setBusy(true);
    try {
      const data = await apiPost<{ authorizationUrl: string; redirectUri: string; expiresAt: number }>(
        '/user/application/oauth2/authorize',
        { applicationId },
      );
      location.assign(data.authorizationUrl);
    } catch (error) {
      showNotice('error', errorMessage(error, 'Unable to start OAuth2 authorization.'));
      setBusy(false);
    }
  };

  const startMonitoring = async (applicationId: string) => {
    setBusy(true);
    try {
      const data = await apiPost<{ status: 'active'; webhookUrl: string; expiresAt?: number }>('/user/application/watch', {
        applicationId,
      });
      showNotice('success', `Monitoring started. Webhook: ${data.webhookUrl}`);
      await loadApplications();
    } catch (error) {
      showNotice('error', errorMessage(error, 'Unable to start monitoring.'));
    } finally {
      setBusy(false);
    }
  };

  const stopMonitoring = async (applicationId: string) => {
    setBusy(true);
    try {
      await apiPost<{ stopped: true }>('/user/application/stop', { applicationId });
      showNotice('success', 'Monitoring stopped.');
      await loadApplications();
    } catch (error) {
      showNotice('error', errorMessage(error, 'Unable to stop monitoring.'));
    } finally {
      setBusy(false);
    }
  };

  return {
    applications,
    loading,
    busy,
    createApplication,
    deleteApplication,
    authorize,
    startMonitoring,
    stopMonitoring,
  };
}
