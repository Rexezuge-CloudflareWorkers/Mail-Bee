import { describe, expect, it } from 'vitest';
import { WebhookSecurityUtil } from '@mail-bee/provider-clients/webhook';

describe('WebhookSecurityUtil', () => {
  it('matches a secret against its SHA-256 hash', async () => {
    const hash = await WebhookSecurityUtil.hashSecret('shared-secret');
    await expect(WebhookSecurityUtil.matchesSecret('shared-secret', hash)).resolves.toBe(true);
    await expect(WebhookSecurityUtil.matchesSecret('other-secret', hash)).resolves.toBe(false);
  });

  it('rejects missing values without hashing them', async () => {
    await expect(WebhookSecurityUtil.matchesSecret(null, 'hash')).resolves.toBe(false);
    await expect(WebhookSecurityUtil.matchesSecret('secret', undefined)).resolves.toBe(false);
  });

  it('round-trips base64url payloads', () => {
    const encoded = WebhookSecurityUtil.base64UrlEncodeString(JSON.stringify({ historyId: '42' }));
    expect(WebhookSecurityUtil.base64UrlDecodeToString(encoded)).toBe('{"historyId":"42"}');
    expect(encoded).not.toContain('=');
  });
});
