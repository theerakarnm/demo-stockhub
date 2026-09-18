import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { Env } from '../env';
import { lazyDb } from './db';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('lazyDb', () => {
  test('opens on first get, answers a query, closes', async () => {
    const accessor = lazyDb({ DATABASE_URL: url } as unknown as Env);
    expect(accessor.opened).toBe(false);
    const rows = (await accessor.get().execute(sql`select 1 as one`)) as Array<{ one: number }>;
    expect(rows[0]?.one).toBe(1);
    expect(accessor.opened).toBe(true);
    await accessor.close();
    expect(accessor.opened).toBe(false);
  });
});
