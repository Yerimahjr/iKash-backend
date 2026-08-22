import { rateLimitConfig } from './rate-limit.config';

describe('rateLimitConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default values when environment variables are not set', () => {
    delete process.env.RATE_LIMIT_AUTH_MAX;
    delete process.env.RATE_LIMIT_AUTH_TTL_MS;

    expect(rateLimitConfig.auth.limit).toBe(5);
    expect(rateLimitConfig.auth.ttl).toBe(60000);

    expect(rateLimitConfig.registration.limit).toBe(10);
    expect(rateLimitConfig.registration.ttl).toBe(60000);

    expect(rateLimitConfig.alias.limit).toBe(30);
    expect(rateLimitConfig.alias.ttl).toBe(60000);

    expect(rateLimitConfig.kycStart.limit).toBe(5);
    expect(rateLimitConfig.kycStart.ttl).toBe(60000);

    expect(rateLimitConfig.kycWebhook.limit).toBe(20);
    expect(rateLimitConfig.kycWebhook.ttl).toBe(60000);
  });

  it('should return parsed values from environment variables', () => {
    process.env.RATE_LIMIT_AUTH_MAX = '100';
    process.env.RATE_LIMIT_AUTH_TTL_MS = '120000';

    expect(rateLimitConfig.auth.limit).toBe(100);
    expect(rateLimitConfig.auth.ttl).toBe(120000);
  });
});
