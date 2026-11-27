/**
 * Builds the RFC 5322 message handed to Cloudflare Email Sending.
 *
 * The provider's raw MIME cannot be forwarded unchanged. The legacy
 * `EmailMessage` send path enforces three rules that a stored message almost
 * never satisfies:
 *
 * - the MIME `From` address must equal the `EmailMessage` envelope sender
 *   (`SEND_FROM`), but a forwarded message's `From` is the original sender;
 * - a `Received` header is rejected, and both Gmail `format=raw` and Graph
 *   `/messages/{id}/$value` return the stored transport headers;
 * - a `Message-ID` is required, and an old message may not carry one.
 *
 * Every one of those failures is a plain `Error` without a `code`, which is why
 * they used to surface as an opaque "forwarding failed".
 *
 * This module rewrites only the top-level header block. Everything from the
 * first blank line onward — body, multipart boundaries, attachments and their
 * encodings — is copied byte-for-byte.
 */

const FORWARDED_EMAIL_PATTERN: RegExp = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;
const HEADER_NAME_PATTERN: RegExp = /^[!#$%&'*+\-.^\w`|~]+$/;

/**
 * Transport, authentication and platform-controlled headers the Email Service
 * either rejects or rewrites itself. They describe the delivery path of the
 * original message, not its content, so dropping them loses nothing a reader
 * would see.
 */
const DROPPED_HEADERS: ReadonlySet<string> = new Set([
  'received',
  'x-received',
  'return-path',
  'delivered-to',
  'dkim-signature',
  'domainkey-signature',
  'arc-seal',
  'arc-message-signature',
  'arc-authentication-results',
  'authentication-results',
  'received-spf',
  'feedback-id',
  'tls-required',
  'tls-report-domain',
  'tls-report-submitter',
  'cfbl-address',
  'cfbl-feedback-id',
  'from',
  'to',
  'cc',
  'bcc',
  'date',
  'message-id',
  'reply-to',
  'content-length',
  'lines',
  'status',
  'x-status',
]);

interface MimeHeader {
  name: string;
  value: string;
}

export interface ForwardedMimeOptions {
  /**
   * The address on an onboarded Email Service domain. Used for both the SMTP
   * envelope and the MIME `From` header, which the runtime requires to match.
   */
  envelopeFrom: string;
  recipient: string;
  /**
   * Human-readable mailbox label for the `X-Mail-Bee-Mailbox` tracing header.
   */
  mailbox: string;
}

/**
 * Extracts the bare address from a configured value such as
 * `Mail-Bee <forward@example.com>`.
 */
function bareAddress(value: string): string {
  const open: number = value.indexOf('<');
  const close: number = value.indexOf('>', open + 1);
  if (open !== -1 && close > open) {
    return value
      .slice(open + 1, close)
      .trim()
      .toLowerCase();
  }
  return value.trim().toLowerCase();
}

function isValidAddress(value: string): boolean {
  return FORWARDED_EMAIL_PATTERN.test(value);
}

/**
 * Solves the first blank line that separates the header block from the body.
 * CRLF wins when both appear at the same offset, since that is the canonical
 * form and a bare LF inside a folded header must not be mistaken for the split.
 */
function splitMessage(raw: string): { headerText: string; body: string } {
  const crlf: number = raw.indexOf('\r\n\r\n');
  const lf: number = raw.indexOf('\n\n');

  if (crlf === -1 && lf === -1) {
    // No separator means there is no parseable header block. Keep every byte as
    // the body rather than discarding content that looks like a header line.
    return { headerText: '', body: raw };
  }
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    return { headerText: raw.slice(0, crlf), body: raw.slice(crlf + 4) };
  }
  return { headerText: raw.slice(0, lf), body: raw.slice(lf + 2) };
}

/**
 * Unfolds continuation lines and keeps only structurally valid fields. A line
 * without a colon that is not a continuation is skipped rather than promoted
 * into a header, because a malformed field would make the whole send invalid.
 */
function parseHeaders(headerText: string): MimeHeader[] {
  const headers: MimeHeader[] = [];

  for (const line of headerText.split(/\r?\n/)) {
    if (/^[ \t]/.test(line)) {
      const previous: MimeHeader | undefined = headers.at(-1);
      if (previous) {
        previous.value = `${previous.value} ${line.trim()}`.trim();
      }
      continue;
    }

    const colon: number = line.indexOf(':');
    if (colon <= 0) {
      continue;
    }
    const name: string = line.slice(0, colon).trim();
    if (!HEADER_NAME_PATTERN.test(name)) {
      continue;
    }
    headers.push({ name, value: sanitizeHeaderValue(line.slice(colon + 1)) });
  }

  return headers;
}

/**
 * A header value must stay on one line. Unfolded values are already joined with
 * spaces; any stray CR/LF here is header injection and is collapsed.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replaceAll(/[\r\n]+/g, ' ').trim();
}

function formatHeader(name: string, value: string): string {
  return `${name}: ${sanitizeHeaderValue(value)}`;
}

function messageIdDomain(from: string): string {
  const at: number = from.lastIndexOf('@');
  const domain: string = at === -1 ? '' : from.slice(at + 1);
  return domain && HEADER_NAME_PATTERN.test(domain) ? domain : 'mail-bee.invalid';
}

function generateMessageId(from: string): string {
  return `<${crypto.randomUUID()}@${messageIdDomain(from)}>`;
}

/**
 * Rewrites the top-level headers so the message can be sent through
 * `EmailMessage(envelopeFrom, recipient, raw)` while preserving the body bytes.
 */
export function buildForwardedMime(raw: string, options: ForwardedMimeOptions): string {
  const envelopeFrom: string = bareAddress(options.envelopeFrom);
  if (!isValidAddress(envelopeFrom)) {
    throw new TypeError('SEND_FROM must be a single email address on an onboarded sending domain.');
  }

  const recipient: string = bareAddress(options.recipient);
  if (!isValidAddress(recipient)) {
    throw new TypeError('The forwarding recipient is not a valid email address.');
  }

  const { headerText, body } = splitMessage(raw);
  const original: MimeHeader[] = parseHeaders(headerText);
  const originalFrom: string | undefined = original.find((header) => header.name.toLowerCase() === 'from')?.value;

  const kept: string[] = original
    .filter((header) => !DROPPED_HEADERS.has(header.name.toLowerCase()))
    .map((header) => formatHeader(header.name, header.value));

  const rewritten: string[] = [
    formatHeader('From', envelopeFrom),
    formatHeader('To', recipient),
    formatHeader('Date', new Date().toUTCString()),
    formatHeader('Message-ID', generateMessageId(envelopeFrom)),
  ];

  // Keep replying useful even though the visible sender has to be SEND_FROM.
  if (originalFrom) {
    const replyTo: string = bareAddress(originalFrom);
    if (isValidAddress(replyTo)) {
      rewritten.push(formatHeader('Reply-To', replyTo));
    }
    rewritten.push(formatHeader('X-Mail-Bee-Original-From', originalFrom));
  }

  rewritten.push(
    ...kept,
    formatHeader('X-Mail-Bee-Forwarded', 'yes'),
    formatHeader('X-Mail-Bee-Mailbox', options.mailbox || options.envelopeFrom),
  );

  return `${rewritten.join('\r\n')}\r\n\r\n${body}`;
}

export { bareAddress };
