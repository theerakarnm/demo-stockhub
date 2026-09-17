import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration.
 *
 * Commands (run from the repo root):
 *   bun run db:generate   schema TS -> ./drizzle/*.sql   (commit the SQL)
 *   bun run db:migrate    apply pending SQL files to DATABASE_URL
 *   bun run db:push       dev-only shortcut, skips the SQL files
 *   bun run db:studio     browse the data
 *
 * DATABASE_URL is read from the environment, never hard coded. Copy
 * .env.example to .env at the repo root and `docker compose up -d` first.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repo root and start Postgres with `bun run docker:up`.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  // One file per bounded area. index.ts only re-exports, so the glob is enough.
  schema: './src/schema/*.ts',
  out: './drizzle',
  dbCredentials: { url: connectionString },
  // Keeps generated SQL readable in review.
  verbose: true,
  // Ask before a destructive statement instead of silently dropping a column.
  strict: true,
});
