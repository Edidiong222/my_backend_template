import * as Joi from 'joi';

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  APP_PORT: Joi.number().integer().min(1).max(65535).default(4000),
  APP_HOST: Joi.string().default('0.0.0.0'),
  APP_NAME: Joi.string().default('My Backend Starter'),
  APP_PREFIX: Joi.string().default('api/v1'),
  APP_URL: Joi.string().uri().default('http://localhost:4000'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  TRUSTED_PROXIES: Joi.string().allow('').default(''),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().integer().min(1).max(65535).default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_LOGGING: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),

  EMAIL_SERVICE: Joi.string().valid('console').default('console'),
  EMAIL_FROM: Joi.string().email().default('no-reply@example.com'),

  EMAIL_VERIFICATION_TOKEN_TTL: Joi.string().default('24h'),
  PASSWORD_RESET_TOKEN_TTL: Joi.string().default('1h'),

  ADMIN_EMAIL: Joi.string().email().optional(),
  ADMIN_PASSWORD: Joi.string().min(8).optional(),
  ADMIN_FIRST_NAME: Joi.string().default('Admin'),
  ADMIN_LAST_NAME: Joi.string().default('User'),
}).unknown(true);
