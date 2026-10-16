import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../../database/database.module.ts';
import { users, type NewUser, type User } from '../../database/schema/index.ts';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ?? null;
  }

  async create(data: NewUser): Promise<User | null> {
    const [user] = await this.db
      .insert(users)
      .values(data)
      .onConflictDoNothing({ target: users.email })
      .returning();
    return user ?? null;
  }
}
