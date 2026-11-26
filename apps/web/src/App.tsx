import { useState, type SyntheticEvent } from 'react';
import { NoticeBar, Unauthorized } from '@rexezuge/web';
import type { ApplicationDto, ApplicationFormValues } from './types';
import { providerIds, providerLabels } from './lib/providers';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useForwardedMessages } from './hooks/useForwardedMessages';
import { useNotice } from './hooks/useNotice';
import { useApplications } from './hooks/useApplications';
import { Button } from './components/ui/Button';
import { Card, CardHeader, CardTitle } from './components/ui/Card';
import { Input, Label, Select } from './components/ui/Input';
import { Badge, ConnectionBadge, WatchBadge } from './components/ui/Badge';

const NOTICE_STATUS_LABELS = { success: 'Success', error: 'Error' } as const;

const emptyForm: ApplicationFormValues = {
  displayName: '',
  providerId: 'google-gmail',
  clientId: '',
  clientSecret: '',
  gmailPubsubTopicName: '',
};

type ApplicationActions = {
  busy: boolean;
  authorize: (applicationId: string) => void;
  startMonitoring: (applicationId: string) => void;
  stopMonitoring: (applicationId: string) => void;
  deleteApplication: (applicationId: string) => void;
};

type MessageState = ReturnType<typeof useForwardedMessages>;

function ConnectMailboxForm({
  form,
  setForm,
  busy,
  onSubmit,
}: Readonly<{
  form: ApplicationFormValues;
  setForm: (form: ApplicationFormValues) => void;
  busy: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect mailbox</CardTitle>
        <span className="text-sm text-[var(--color-text-muted)]">OAuth2 only</span>
      </CardHeader>
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            placeholder="My inbox"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="providerId">Provider</Label>
          <Select
            id="providerId"
            className="w-full"
            value={form.providerId}
            onChange={(event) => setForm({ ...form, providerId: event.target.value as ApplicationFormValues['providerId'] })}
          >
            {providerIds.map((providerId) => (
              <option key={providerId} value={providerId}>
                {providerLabels[providerId]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clientId">OAuth2 client ID</Label>
          <Input
            id="clientId"
            value={form.clientId}
            onChange={(event) => setForm({ ...form, clientId: event.target.value })}
            placeholder="Client ID from your provider"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clientSecret">OAuth2 client secret</Label>
          <Input
            id="clientSecret"
            type="password"
            value={form.clientSecret}
            onChange={(event) => setForm({ ...form, clientSecret: event.target.value })}
            placeholder="Client secret from your provider"
            required
          />
        </div>
        {form.providerId === 'google-gmail' && (
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="gmailPubsubTopicName">Gmail Pub/Sub topic name</Label>
            <Input
              id="gmailPubsubTopicName"
              value={form.gmailPubsubTopicName}
              onChange={(event) => setForm({ ...form, gmailPubsubTopicName: event.target.value })}
              placeholder="projects/your-project/topics/your-topic"
              required
            />
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" variant="primary" loading={busy}>
            Add mailbox
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MessageList({ state }: Readonly<{ state: MessageState }>) {
  if (state.loading) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;
  if (state.messages.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">No forwarded messages yet.</p>;

  return (
    <ul className="space-y-2">
      {state.messages.map((message) => (
        <li key={message.processedMessageId} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="break-all">{message.providerMessageId}</span>
          <Badge variant={message.status === 'error' ? 'error' : 'success'}>
            {message.status === 'summarized' ? 'Forwarded' : message.status}
          </Badge>
          <span className="text-[var(--color-text-muted)]">{new Date(message.createdAt).toLocaleString()}</span>
          {message.errorMessage && <span className="text-[var(--color-error-text)]">{message.errorMessage}</span>}
        </li>
      ))}
    </ul>
  );
}

function MailboxCard({
  application,
  actions,
  messagesState,
}: Readonly<{
  application: ApplicationDto;
  actions: ApplicationActions;
  messagesState: MessageState;
}>) {
  const watchStatus = application.watchStatus ?? 'none';
  const showMessages = messagesState.applicationId === application.applicationId;

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle>{application.displayName}</CardTitle>
        <div className="flex items-center gap-2">
          <ConnectionBadge status={application.status} />
          <WatchBadge status={watchStatus} />
        </div>
      </CardHeader>

      <div className="space-y-1 text-sm text-[var(--color-text-secondary)]">
        <p>Provider: {providerLabels[application.providerId]}</p>
        <p>Connected mailbox: {application.providerEmail || 'Not connected yet'}</p>
        {application.status === 'draft' && (
          <p className="break-all">
            OAuth redirect URI to register with your provider: {location.origin}/api/oauth2/callback/{application.applicationId}
          </p>
        )}
        {application.webhookUrl && watchStatus === 'active' && <p className="break-all">Webhook: {application.webhookUrl}</p>}
        {application.watchExpiresAt && <p>Watch expires: {new Date(application.watchExpiresAt).toLocaleString()}</p>}
        {application.forwardedCount !== undefined && <p>Forwarded messages: {application.forwardedCount}</p>}
      </div>

      {application.lastError && (
        <p className="rounded-lg bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-text)]">{application.lastError}</p>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {application.status === 'draft' && (
          <Button variant="primary" size="sm" disabled={actions.busy} onClick={() => actions.authorize(application.applicationId)}>
            Authorize
          </Button>
        )}
        {application.status === 'connected' && watchStatus !== 'active' && (
          <Button variant="primary" size="sm" disabled={actions.busy} onClick={() => actions.startMonitoring(application.applicationId)}>
            Start monitoring
          </Button>
        )}
        {watchStatus === 'active' && (
          <Button size="sm" disabled={actions.busy} onClick={() => actions.stopMonitoring(application.applicationId)}>
            Stop monitoring
          </Button>
        )}
        <Button size="sm" disabled={actions.busy} onClick={() => messagesState.open(application.applicationId)}>
          Show forwarded messages
        </Button>
        <Button variant="danger" size="sm" disabled={actions.busy} onClick={() => actions.deleteApplication(application.applicationId)}>
          Delete
        </Button>
      </div>

      {showMessages && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-base)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Forwarded messages</span>
            <Button variant="ghost" size="sm" onClick={messagesState.close}>
              Hide
            </Button>
          </div>
          <MessageList state={messagesState} />
        </div>
      )}
    </Card>
  );
}

function MailboxList({
  loading,
  applications,
  actions,
  messagesState,
  userEmail,
}: Readonly<{
  loading: boolean;
  applications: ApplicationDto[];
  actions: ApplicationActions;
  messagesState: MessageState;
  userEmail: string;
}>) {
  if (loading) return <p className="text-sm text-[var(--color-text-muted)]">Loading mailboxes…</p>;
  if (applications.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-text-secondary)]">
          No mailboxes yet. Add one above, authorize it, then start monitoring to forward incoming mail to {userEmail}.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {applications.map((application) => (
        <MailboxCard key={application.applicationId} application={application} actions={actions} messagesState={messagesState} />
      ))}
    </div>
  );
}

export default function App() {
  const { notice, showNotice } = useNotice();
  const { user, authorized } = useCurrentUser();
  const applications = useApplications({ showNotice });
  const messagesState = useForwardedMessages({ showNotice });
  const [form, setForm] = useState<ApplicationFormValues>(emptyForm);

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  if (!authorized || !user) {
    return (
      <Unauthorized
        title="Access required"
        message="You must authenticate with Cloudflare Access to manage your mailboxes."
        actionLabel="Authenticate with Cloudflare Zero Trust"
      />
    );
  }

  const submitForm = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await applications.createApplication(form)) setForm(emptyForm);
  };

  const actions: ApplicationActions = {
    busy: applications.busy,
    authorize: (id) => {
      void applications.authorize(id);
    },
    startMonitoring: (id) => {
      void applications.startMonitoring(id);
    },
    stopMonitoring: (id) => {
      void applications.stopMonitoring(id);
    },
    deleteApplication: (id) => {
      if (confirm(`Delete mailbox "${applications.applications.find((app) => app.applicationId === id)?.displayName || ''}"?`)) {
        void applications.deleteApplication(id);
      }
    },
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-[var(--color-accent)]">Mail-Bee</span>
            <span className="text-sm text-[var(--color-text-muted)]">Mailbox forwarding</span>
          </div>
          <span className="text-sm text-[var(--color-text-secondary)]">{user.email}</span>
        </div>
      </header>

      {notice && <NoticeBar notice={notice} statusLabels={NOTICE_STATUS_LABELS} />}

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <ConnectMailboxForm form={form} setForm={setForm} busy={applications.busy} onSubmit={(event) => void submitForm(event)} />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your mailboxes</h2>
            <span className="text-sm text-[var(--color-text-muted)]">
              {applications.applications.length} {applications.applications.length === 1 ? 'mailbox' : 'mailboxes'}
            </span>
          </div>

          <MailboxList
            loading={applications.loading}
            applications={applications.applications}
            actions={actions}
            messagesState={messagesState}
            userEmail={user.email}
          />
        </section>
      </main>
    </div>
  );
}
