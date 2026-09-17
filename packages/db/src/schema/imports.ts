/**
 * One uploaded marketplace export file = one `import_batches` row.
 *
 * The row is the audit anchor: it links the original file in R2, the parse
 * statistics, the issues we reported, and every order that came out of it. If a
 * customer asks 'why did my stock drop by 12 yesterday', you start here.
 *
 * Status flow (see IMPORT_STATUSES in @stockhub/core):
 *   uploaded -> parsing -> preview_ready -> applying -> applied
 *   any step can end in `failed`.
 * Stock only moves on the applying -> applied step, inside one transaction.
 */

import type { ParseIssue } from '@stockhub/core';
import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps, tsColumn } from './_shared';
import { channels } from './channels';
import { channelKindEnum, importStatusEnum } from './enums';
import { orgIdColumn, users } from './org';

export const importBatches = pgTable(
  'import_batches',
  {
    id: primaryId(),
    orgId: orgIdColumn(),
    /** Chosen by the user on upload, or inferred from the detected kind. */
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    /** What the adapter registry detected from the file headers. */
    detectedKind: channelKindEnum('detected_kind'),
    status: importStatusEnum('status').notNull().default('uploaded'),
    fileName: text('file_name').notNull(),
    /** R2 object key. See importObjectKey() in @stockhub/core/ports/storage. */
    r2ObjectKey: text('r2_object_key').notNull(),
    fileSize: integer('file_size').notNull().default(0),
    /** SHA-256 of the bytes. Lets the UI warn 'this file was already imported'. */
    checksum: text('checksum'),
    rowsRead: integer('rows_read').notNull().default(0),
    ordersParsed: integer('orders_parsed').notNull().default(0),
    /**
     * ParseIssue[] from the adapter, stored verbatim so the preview screen can
     * be rebuilt without re-parsing the file.
     */
    issues: jsonb('issues').$type<ParseIssue[]>().notNull().default([]),
    /** Set when the batch reaches `applied`. Null until then. */
    appliedAt: tsColumn('applied_at'),
    /** Short human readable reason when status is `failed`. */
    errorMessage: text('error_message'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('import_batches_org_idx').on(table.orgId),
    // The import list screen: newest first, filtered by tenant and status.
    index('import_batches_org_created_idx').on(table.orgId, table.createdAt),
    index('import_batches_status_idx').on(table.orgId, table.status),
    index('import_batches_channel_idx').on(table.channelId),
  ],
);

export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
