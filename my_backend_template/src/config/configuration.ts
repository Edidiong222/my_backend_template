const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
};

const toList = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: toNumber(process.env.APP_PORT, 4000),
    host: process.env.APP_HOST ?? '0.0.0.0',
    name: process.env.APP_NAME ?? 'My Backend Starter',
    prefix: process.env.APP_PREFIX ?? 'api/v1',
    url: process.env.APP_URL ?? 'http://localhost:4000',
    corsOrigins: toList(process.env.CORS_ORIGINS),
    trustedProxies: toList(process.env.TRUSTED_PROXIES),
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toNumber(process.env.DB_PORT, 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'postgres',
    logging: toBoolean(process.env.DB_LOGGING, false),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  throttle: {
    ttlSeconds: toNumber(process.env.THROTTLE_TTL_SECONDS, 60),
    limit: toNumber(process.env.THROTTLE_LIMIT, 100),
  },
  email: {
    service: process.env.EMAIL_SERVICE ?? 'console',
    from: process.env.EMAIL_FROM ?? 'no-reply@example.com',
  },
  tokens: {
    emailVerificationTtl: process.env.EMAIL_VERIFICATION_TOKEN_TTL ?? '24h',
    passwordResetTtl: process.env.PASSWORD_RESET_TOKEN_TTL ?? '1h',
  },
});
