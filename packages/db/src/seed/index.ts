/**
 * Seed runner: `bun run db:seed` (from the repo root).
 *
 * This file is the CLI shell only. The actual write lives in ./seed-data.ts so
 * that the demo reset endpoint can reuse it inside a Worker, where a top-level
 * await and `process.env` are not available.
 *
 * Safety: TRUNCATE is destructive, so the script refuses to run against a host
 * that is not local unless you set SEED_FORCE=1. Losing a demo database is
 * annoying; losing a customer database ends the deal.
 *
 * Prerequisite: the schema must exist. Run `bun run db:migrate` first.
 */

import { createDbFromClient, createPostgresClient, requireDatabaseUrl } from '../client';
import { SEED_IDS, SEED_ORG, SEED_USERS } from './data';
import { seedDatabase } from './seed-data';

const assertLocalDatabase = (url: string): void => {
  const host = new URL(url).hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === 'postgres';
  if (!isLocal && process.env.SEED_FORCE !== '1') {
    throw new Error(
      `Refusing to truncate a non-local database (${host}). Set SEED_FORCE=1 if you really mean it.`,
    );
  }
};

const main = async (): Promise<void> => {
  const url = requireDatabaseUrl();
  assertLocalDatabase(url);

  const client = createPostgresClient(url);
  const db = createDbFromClient(client);

  try {
    const summary = await db.transaction((tx) => seedDatabase(tx));

    console.info('Seed complete');
    console.info(`  org         ${SEED_ORG.name} (${SEED_IDS.org})`);
    console.info(`  users       ${SEED_USERS.length}`);
    console.info(`  channels    ${summary.channels}`);
    console.info(`  products    ${summary.products} / variants ${summary.variants}`);
    console.info(`  lots        ${summary.lots} (${summary.units} units)`);
    console.info(`  stock value ${(summary.stockValue / 100).toLocaleString('th-TH')} baht`);
    console.info(`  orders      ${summary.orders} (${summary.orderLines} lines)`);
  } finally {
    await client.end();
  }
};

await main();
