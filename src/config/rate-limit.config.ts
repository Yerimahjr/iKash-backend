export const rateLimitConfig = {
  get auth() {
    return {
      limit: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10),
      ttl: parseInt(process.env.RATE_LIMIT_AUTH_TTL_MS || '60000', 10),
    };
  },
  get registration() {
    return {
      limit: parseInt(process.env.RATE_LIMIT_REGISTRATION_MAX || '10', 10),
      ttl: parseInt(process.env.RATE_LIMIT_REGISTRATION_TTL_MS || '60000', 10),
    };
  },
  get alias() {
    return {
      limit: parseInt(process.env.RATE_LIMIT_ALIAS_VALIDATION_MAX || '30', 10),
      ttl: parseInt(
        process.env.RATE_LIMIT_ALIAS_VALIDATION_TTL_MS || '60000',
        10,
      ),
    };
  },
  get kycStart() {
    return {
      limit: parseInt(process.env.RATE_LIMIT_KYC_START_MAX || '5', 10),
      ttl: parseInt(process.env.RATE_LIMIT_KYC_START_TTL_MS || '60000', 10),
    };
  },
  get kycWebhook() {
    return {
      limit: parseInt(process.env.RATE_LIMIT_KYC_WEBHOOK_MAX || '20', 10),
      ttl: parseInt(process.env.RATE_LIMIT_KYC_WEBHOOK_TTL_MS || '60000', 10),
    };
  },
};
