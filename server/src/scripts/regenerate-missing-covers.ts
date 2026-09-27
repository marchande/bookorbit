/**
 * Regenerate covers for books that have no cover file on disk (e.g. after an app-data volume was lost).
 *
 * Runs inside the app container against the live database, using the same MetadataService.refreshCoverForBook
 * path as the "Re-extract cover" action. Only the database + metadata modules are loaded: no web server,
 * scanner, watchers or schedulers. Books that already have a cover file are skipped, so it is safe to re-run
 * and resumes naturally after an interruption.
 *
 *   node dist/scripts/regenerate-missing-covers.js [--dry-run] [--concurrency 3] [--limit N]
 */
import { readdir } from 'node:fs/promises';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { bookCoverDirPath, findPreferredBookCoverFileName } from '../common/book-cover-storage';
import { appConfig, dbConfig, fileWriteConfig, storageConfig } from '../config/config';
import { validateEnv } from '../config/env.validation';
import { DB, DbModule } from '../db/db.module';
import * as schema from '../db/schema';
import { MetadataModule } from '../modules/metadata/metadata.module';
import { MetadataService } from '../modules/metadata/metadata.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, load: [appConfig, dbConfig, storageConfig, fileWriteConfig] }),
    DbModule,
    MetadataModule,
  ],
})
class RegenerateCoversCliModule {}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function hasCoverFile(appDataPath: string, bookId: number): Promise<boolean> {
  try {
    return findPreferredBookCoverFileName(await readdir(bookCoverDirPath(appDataPath, bookId))) !== null;
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const concurrency = Math.max(1, Number(arg('concurrency') ?? 3));
  const limit = arg('limit') ? Number(arg('limit')) : Infinity;

  const app = await NestFactory.createApplicationContext(RegenerateCoversCliModule, { logger: ['error', 'warn', 'log'] });
  try {
    const db = app.get<NodePgDatabase<typeof schema>>(DB);
    const metadata = app.get(MetadataService);
    const appDataPath = app.get(ConfigService).get<string>('storage.appDataPath')!;

    type Row = { bookId: number; path: string; format: string | null };
    const result = await db.execute<Row>(sql`
      select b.id as "bookId", f.absolute_path as "path", f.format as "format"
      from books b join book_files f on f.id = b.primary_file_id
      where b.status = 'present'
      order by b.id
    `);
    const books: Row[] = Array.isArray(result) ? (result as Row[]) : ((result as { rows: Row[] }).rows ?? []);

    const missing: typeof books = [];
    for (const b of books) {
      if (!(await hasCoverFile(appDataPath, b.bookId))) missing.push(b);
    }
    const todo = missing.slice(0, limit);
    console.log(
      `[regen-covers] books=${books.length} missingCover=${missing.length} toProcess=${todo.length} concurrency=${concurrency} dryRun=${dryRun}`,
    );
    if (dryRun) return;

    let next = 0;
    let done = 0;
    let saved = 0;
    let failed = 0;
    const startedAt = Date.now();
    const worker = async (): Promise<void> => {
      while (next < todo.length) {
        const b = todo[next++]!;
        try {
          if (await metadata.refreshCoverForBook(b.bookId, b.path, b.format ?? '')) saved++;
        } catch (err) {
          failed++;
          console.warn(`[regen-covers] bookId=${b.bookId} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        done++;
        if (done % 100 === 0 || done === todo.length) {
          const rate = done / ((Date.now() - startedAt) / 1000);
          const etaMin = Math.round((todo.length - done) / rate / 60);
          console.log(`[regen-covers] ${done}/${todo.length} processed, ${saved} covers saved, ${failed} errors, ~${etaMin} min left`);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(
      `[regen-covers] finished: ${done} processed, ${saved} covers saved, ${failed} errors, ${Math.round((Date.now() - startedAt) / 60000)} min`,
    );
  } finally {
    await app.close();
  }
}

void run();
