import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DB } from '../../db';
import * as schema from '../../db/schema';

@Injectable()
export class ApiKeyRepository {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async create(data: { userId: number; name: string; keyPrefix: string; keyHash: string; scopes: string[]; expiresAt: Date | null }) {
    const [row] = await this.db.insert(schema.apiKeys).values(data).returning();
    return row;
  }

  findByHash(keyHash: string) {
    return this.db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.keyHash, keyHash) });
  }

  findAllForUser(userId: number) {
    return this.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId)).orderBy(desc(schema.apiKeys.createdAt));
  }

  async revoke(id: number, userId: number): Promise<boolean> {
    const rows = await this.db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)))
      .returning({ id: schema.apiKeys.id });
    return rows.length > 0;
  }

  async touch(id: number, at: Date) {
    await this.db.update(schema.apiKeys).set({ lastUsedAt: at }).where(eq(schema.apiKeys.id, id));
  }
}
