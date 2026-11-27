import { CryptoUtil } from '@mail-bee/shared/utils';

class WebhookSecurityUtil {
  public static generateSecret(): string {
    const bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32));
    return this.base64UrlEncode(bytes);
  }

  public static async hashSecret(secret: string): Promise<string> {
    return CryptoUtil.sha256Hex(secret);
  }

  public static async matchesSecret(secret: string | undefined | null, expectedHash: string | undefined | null): Promise<boolean> {
    if (!secret || !expectedHash) return false;
    const actualHash: string = await this.hashSecret(secret);
    return this.constantTimeEqual(actualHash, expectedHash);
  }

  /**
   * A plain `===` leaks the length of the common prefix through its early exit.
   * The hashes are random-looking hex, so compare every byte instead: the cost
   * depends on the public hash length, not on how much of the secret matched.
   */
  private static constantTimeEqual(actual: string, expected: string): boolean {
    const actualBytes: Uint8Array = new TextEncoder().encode(actual);
    const expectedBytes: Uint8Array = new TextEncoder().encode(expected);
    let difference: number = actualBytes.length ^ expectedBytes.length;
    for (const [index, byte] of actualBytes.entries()) {
      difference |= byte ^ (expectedBytes[index] ?? 0);
    }
    return difference === 0;
  }

  public static base64UrlDecodeToString(value: string): string {
    const normalized: string = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded: string = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return atob(padded);
  }

  public static base64UrlEncodeString(value: string): string {
    const bytes: Uint8Array = new TextEncoder().encode(value);
    return this.base64UrlEncode(bytes);
  }

  private static base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte: number): void => {
      binary += String.fromCodePoint(byte);
    });
    // btoa + URL-safe transform; Uint8Array#toBase64 not guaranteed in all Workers runtimes

    return btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/={0,2}$/, '');
  }
}

export { WebhookSecurityUtil };
