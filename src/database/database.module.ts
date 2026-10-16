import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../config/env.ts';
import * as schema from './schema/index.ts';

export const DB = Symbol('DB');
export type Database = PostgresJsDatabase<typeof schema> & { $client: Sql };

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Database => {
        const client = postgres(config.get('DATABASE_URL', { infer: true }));
        return drizzle({ client, schema, casing: 'snake_case' });
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Database) {}

  async onApplicationShutdown() {
    await this.db.$client.end();
  }
}
