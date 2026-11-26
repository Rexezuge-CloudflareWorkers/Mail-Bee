import { PROVIDER_FASTMAIL_JMAP } from '@mail-bee/shared/constants';
import { ConfigurableImapEmailProvider } from './ConfigurableImapEmailProvider';

class FastmailImapEmailProvider extends ConfigurableImapEmailProvider {
  constructor() {
    super({ providerId: PROVIDER_FASTMAIL_JMAP, host: 'imap.fastmail.com', port: 993, noun: 'Fastmail' });
  }
}

export { FastmailImapEmailProvider };
