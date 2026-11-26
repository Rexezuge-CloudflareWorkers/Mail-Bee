/**
 * Minimal stand-in for `cloudflare:email` in the Node test environment.
 * The binding only needs an object carrying the envelope addresses and the raw
 * MIME string for assertions.
 */
class EmailMessage {
  public readonly from: string;
  public readonly to: string;
  public readonly raw: string;

  constructor(from: string, to: string, raw: string | ReadableStream | ArrayBuffer) {
    this.from = from;
    this.to = to;
    this.raw = typeof raw === 'string' ? raw : '';
  }
}

export { EmailMessage };
