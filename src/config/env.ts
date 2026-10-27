import { existsSync } from 'node:fs';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z
    .templateLiteral([
      z.number().int().positive(),
      z.enum(['s', 'm', 'h', 'd']),
    ])
    .default('1h'),
  PUBLIC_URL: z.url().transform((url) => url.replace(/\/+$/, '')),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_test_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  MAIL_TRANSPORT: z.enum(['smtp', 'file']).default('smtp'),
  MAIL_SMTP_HOST: z.string().min(1),
  MAIL_SMTP_PORT: z.coerce.number().int().positive(),
  MAIL_SMTP_USER: z.string().min(1),
  MAIL_SMTP_PASSWORD: z.string().min(1),
  MAIL_FROM: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function loadEnv(): Env {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return validateEnv(process.env);
}
