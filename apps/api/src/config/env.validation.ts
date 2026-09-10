import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  EXECUTION_TIMEOUT_MS: Joi.number().integer().min(100).max(30000).default(3000),
  EXECUTION_MEMORY_LIMIT_MB: Joi.number().integer().min(16).max(1024).default(128),
  EXECUTION_CPU_LIMIT: Joi.number().positive().max(4).default(1),
  EXECUTION_PIDS_LIMIT: Joi.number().integer().min(16).max(512).default(64),
  EXECUTION_MAX_OUTPUT_BYTES: Joi.number().integer().min(1024).max(1048576).default(65536),
});
