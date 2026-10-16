import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/config/env.ts';

const env = loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
