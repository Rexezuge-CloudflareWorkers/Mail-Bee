import { describe, expect, it } from 'vitest';
import { bareAddress, buildForwardedMime } from '@mail-bee/backend-services/forwarding';

const options = {
  envelopeFrom: 'forward@mailbee.example',
  recipient: 'current@example.com',
  mailbox: 'inbox@example.com',
};

function header(mime: string, name: string): string | undefined {
  const block: string = mime.split('\r\n\r\n', 1)[0];
  return block.split('\r\n').find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`));
}

function body(mime: string): string {
  return mime.slice(mime.indexOf('\r\n\r\n') + 4);
}

describe('buildForwardedMime', () => {
  it('rewrites the envelope headers and keeps the body byte-for-byte', () => {
    const originalBody = 'Content-Type: text/plain; charset=utf-8\r\n\r\nHello from Outlook.';
    const raw = [
      'Received: from mail.example.com by mx.example.com; Fri, 27 Nov 2026 01:00:00 +0000',
      'X-Received: by 2002:a05:1234:: with SMTP id abc; Fri, 27 Nov 2026 01:00:00 +0000',
      'Return-Path: <sender@other.example>',
      'DKIM-Signature: v=1; a=rsa-sha256; d=other.example; s=sel; b=abc',
      'From: Original Sender <sender@other.example>',
      'To: Someone <someone@example.com>',
      'Cc: hidden@example.com',
      'Bcc: hidden@example.com',
      'Subject: An important update',
      'Date: Mon, 01 Jan 2024 00:00:00 +0000',
      'Message-ID: <old@other.example>',
      '',
      originalBody,
    ].join('\r\n');

    const forwarded: string = buildForwardedMime(raw, options);

    expect(header(forwarded, 'From')).toBe('From: forward@mailbee.example');
    expect(header(forwarded, 'To')).toBe('To: current@example.com');
    expect(header(forwarded, 'Message-ID')).toMatch(/^Message-ID: <[0-9a-f-]+@mailbee\.example>$/);
    expect(header(forwarded, 'Date')).toBeDefined();
    expect(header(forwarded, 'Subject')).toBe('Subject: An important update');
    expect(header(forwarded, 'Reply-To')).toBe('Reply-To: sender@other.example');
    expect(header(forwarded, 'X-Mail-Bee-Original-From')).toBe('X-Mail-Bee-Original-From: Original Sender <sender@other.example>');
    expect(header(forwarded, 'X-Mail-Bee-Forwarded')).toBe('X-Mail-Bee-Forwarded: yes');
    expect(header(forwarded, 'X-Mail-Bee-Mailbox')).toBe('X-Mail-Bee-Mailbox: inbox@example.com');

    for (const removed of ['Received', 'X-Received', 'Return-Path', 'DKIM-Signature', 'Cc', 'Bcc', 'Date: Mon']) {
      expect(forwarded.split('\r\n\r\n', 1)[0]).not.toContain(removed);
    }
    expect(body(forwarded)).toBe(originalBody);
  });

  it('synthesizes a Message-ID and Date when the stored message has neither', () => {
    const forwarded: string = buildForwardedMime('Subject: No id\r\n\r\nBody', options);

    expect(header(forwarded, 'Message-ID')).toMatch(/^Message-ID: <[0-9a-f-]+@mailbee\.example>$/);
    expect(header(forwarded, 'Date')).toBeDefined();
    expect(body(forwarded)).toBe('Body');
  });

  it('unfolds a folded subject into one safe header line', () => {
    const raw = 'Subject: A long subject\r\n that continues\r\n\tand ends\r\n\r\nBody';
    const forwarded: string = buildForwardedMime(raw, options);

    expect(header(forwarded, 'Subject')).toBe('Subject: A long subject that continues and ends');
    expect(body(forwarded)).toBe('Body');
  });

  it('accepts bare LF messages and writes CRLF headers', () => {
    const forwarded: string = buildForwardedMime('Subject: LF only\n\nLine one\nLine two', options);

    expect(forwarded).toContain('From: forward@mailbee.example\r\n');
    expect(header(forwarded, 'Subject')).toBe('Subject: LF only');
    expect(body(forwarded)).toBe('Line one\nLine two');
  });

  it('keeps multipart boundaries and attachments untouched', () => {
    const multipartBody = [
      '--part-1',
      'Content-Type: text/plain',
      '',
      'Hello',
      '--part-1',
      'Content-Type: application/octet-stream',
      'Content-Transfer-Encoding: base64',
      '',
      'QUJD',
      '--part-1--',
    ].join('\r\n');
    const forwarded: string = buildForwardedMime(
      `Subject: Files\r\nContent-Type: multipart/mixed; boundary="part-1"\r\n\r\n${multipartBody}`,
      options,
    );

    expect(header(forwarded, 'Content-Type')).toBe('Content-Type: multipart/mixed; boundary="part-1"');
    expect(body(forwarded)).toBe(multipartBody);
  });

  it('collapses header injection attempts instead of emitting extra fields', () => {
    const forwarded: string = buildForwardedMime('Subject: Hi\r\n Bcc: attacker@example.com\r\n\r\nBody', options);

    expect(
      forwarded
        .split('\r\n\r\n', 1)[0]
        .split('\r\n')
        .some((line) => line.startsWith('Bcc:')),
    ).toBe(false);
    expect(header(forwarded, 'Subject')).toBe('Subject: Hi Bcc: attacker@example.com');
  });

  it('uses the bare address when SEND_FROM carries a display name', () => {
    const forwarded: string = buildForwardedMime('Subject: Hi\r\n\r\nBody', {
      ...options,
      envelopeFrom: 'Mail-Bee <Forward@Mailbee.Example>',
    });

    expect(header(forwarded, 'From')).toBe('From: forward@mailbee.example');
    expect(header(forwarded, 'Message-ID')).toMatch(/@mailbee\.example>$/);
  });

  it('rejects invalid envelope senders and recipients', () => {
    expect(() => buildForwardedMime('Subject: Hi\r\n\r\nBody', { ...options, envelopeFrom: '' })).toThrow(TypeError);
    expect(() => buildForwardedMime('Subject: Hi\r\n\r\nBody', { ...options, recipient: 'not-an-address' })).toThrow(TypeError);
  });

  it('keeps every byte when the message has no header/body separator', () => {
    const forwarded: string = buildForwardedMime('Subject: No blank line', options);

    expect(body(forwarded)).toBe('Subject: No blank line');
    expect(header(forwarded, 'Subject')).toBeUndefined();
  });

  it('extracts bare addresses from angled configured values', () => {
    expect(bareAddress('Mail-Bee <forward@mailbee.example>')).toBe('forward@mailbee.example');
    expect(bareAddress('  plain@example.com ')).toBe('plain@example.com');
  });
});
