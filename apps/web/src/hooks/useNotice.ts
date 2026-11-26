import { useNotice as useKitNotice } from '@rexezuge/web';
import type { Notice } from '@rexezuge/web';

/**
 * Seed the transient notice from the OAuth callback result the worker puts in
 * the query string: `?oauth2=connected` or `?oauth2=error&message=…`.
 */
function oauthNoticeFromUrl(): Notice | null {
  const params = new URLSearchParams(location.search);
  if (params.get('oauth2') === 'connected') {
    return { kind: 'success', message: 'Mailbox connected. You can start monitoring it now.' };
  }
  if (params.get('oauth2') === 'error') {
    return { kind: 'error', message: params.get('message') || 'Mailbox connection failed.' };
  }
  return null;
}

export function useNotice() {
  return useKitNotice({ initial: oauthNoticeFromUrl() });
}
