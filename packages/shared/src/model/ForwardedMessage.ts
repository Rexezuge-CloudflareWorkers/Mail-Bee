/**
 * A raw RFC 5322 message ready to be handed to the Cloudflare Email Sending
 * binding. We deliberately keep the original bytes: Mail-Bee forwards mail,
 * it does not re-compose or summarise it.
 */
interface ForwardedMessage {
  /**
  Envelope sender; must be an address on an onboarded sending domain.
  */
  envelopeFrom: string;
  /**
  Envelope recipient; the signed-in Mail-Bee user's email address.
  */
  recipient: string;
  /**
  The original message, verbatim.
  */
  raw: string;
  applicationId: string;
  providerMessageId: string;
}

interface ForwardingResult {
  messageId: string;
  forwardedAt: number;
}

export type { ForwardedMessage, ForwardingResult };
