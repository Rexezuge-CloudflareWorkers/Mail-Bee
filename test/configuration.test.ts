import { describe, expect, it } from 'vitest';
import { AppConfiguration, ConfigurationManager, DEFAULT_MAX_APPLICATIONS_PER_USER } from '@mail-bee/backend-runtime/config';

describe('configuration', () => {
  it('is an SDK AppConfiguration subclass with the same values as the static facade', () => {
    const env = { PUBLIC_BASE_URL: 'https://worker.example///', SITE_URL: 'https://worker.example/', OAUTH2_STATE_EXPIRY_MINUTES: '7' };
    const config = AppConfiguration.fromEnv(env);

    expect(config).toBeInstanceOf(AppConfiguration);
    expect(config.getPublicBaseUrl()).toBe('https://worker.example');
    expect(config.getOauth2StateExpiryMinutes()).toBe(7);
    expect(ConfigurationManager.getPublicBaseUrl(env)).toBe(config.getPublicBaseUrl());
    expect(ConfigurationManager.getOauth2StateExpiryMinutes(env)).toBe(config.getOauth2StateExpiryMinutes());
    expect(config.getSiteUrl()).toBe('https://worker.example');
    expect(Array.isArray(config.validate())).toBe(true);
  });

  it('keeps the repo defaults in one place', () => {
    const config = AppConfiguration.fromEnv({});
    expect(config.getMaxApplicationsPerUser()).toBe(Number(DEFAULT_MAX_APPLICATIONS_PER_USER));
    expect(ConfigurationManager.getMaxApplicationsPerUser({})).toBe(Number(DEFAULT_MAX_APPLICATIONS_PER_USER));
    expect(ConfigurationManager.attachment.getMaxSizeBytes({})).toBe(config.getMaxAttachmentSizeBytes());
  });

  it('reads the current env value even when a facade instance is cached', () => {
    const env: { PUBLIC_BASE_URL?: string } = { PUBLIC_BASE_URL: 'https://one.example' };
    expect(ConfigurationManager.getPublicBaseUrl(env)).toBe('https://one.example');
    env.PUBLIC_BASE_URL = 'https://two.example/';
    expect(ConfigurationManager.getPublicBaseUrl(env)).toBe('https://two.example');
  });
});
