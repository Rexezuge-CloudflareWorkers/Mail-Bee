import { describe, expect, it } from 'vitest';
import { validateSendFrom } from '../../scripts/lib/wrangler-config/send-from';
import type { WranglerConfig } from '../../scripts/lib/wrangler-config/types';

describe('validateSendFrom', () => {
  const config = (SEND_FROM: unknown): WranglerConfig => ({ vars: { SEND_FROM } });

  it('accepts a bare address on an onboarded sending domain', () => {
    expect(validateSendFrom(config('forward@mailbee.example'))).toBe('forward@mailbee.example');
    expect(validateSendFrom(config('  forward@mailbee.example  '))).toBe('forward@mailbee.example');
  });

  it('rejects the empty template placeholder and missing or non-string values', () => {
    expect(() => validateSendFrom(config(''))).toThrow('no SEND_FROM value');
    expect(() => validateSendFrom(config(' '.repeat(3)))).toThrow('no SEND_FROM value');
    expect(() => validateSendFrom({ vars: {} })).toThrow('no SEND_FROM value');
    expect(() => validateSendFrom({})).toThrow('no SEND_FROM value');
    expect(() => validateSendFrom(config(123))).toThrow('no SEND_FROM value');
  });

  it('rejects a display name or malformed address', () => {
    expect(() => validateSendFrom(config('Mail-Bee <forward@mailbee.example>'))).toThrow('single bare email address');
    expect(() => validateSendFrom(config('not-an-address'))).toThrow('single bare email address');
  });
});
