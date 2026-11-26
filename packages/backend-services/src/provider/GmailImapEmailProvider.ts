import { PROVIDER_GOOGLE_GMAIL } from '@mail-bee/shared/constants';
import { ConfigurableImapEmailProvider } from './ConfigurableImapEmailProvider';

class GmailImapEmailProvider extends ConfigurableImapEmailProvider {
  constructor() {
    super({ providerId: PROVIDER_GOOGLE_GMAIL, host: 'imap.gmail.com', port: 993, noun: 'Gmail' });
  }
}

export { GmailImapEmailProvider };
