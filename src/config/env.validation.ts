import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  MONGO_URI: Joi.string().uri().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
});
