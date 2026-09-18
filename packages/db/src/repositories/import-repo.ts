/**
 * Import batch lifecycle.
 *
 * The batch row is created the moment the file lands in R2, before any parsing,
 * so a crash mid-parse still leaves a visible 'failed' record with the original
 * file attached instead of a silent gap.
 */

import {
  type ChannelId,
  type ImportBatchId,
  type ImportStatus,
  NotImplementedError,
  type OrgId,
  type ParseIssue,
  type UserId,
} from '@stockhub/core';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type ImportBatch, importBatches } from '../schema';

export interface CreateBatchInput {
  orgId: OrgId;
  channelId?: ChannelId;
  fileName: string;
  r2ObjectKey: string;
  fileSize: number;
  checksum?: string;
  uploadedBy?: UserId;
}

export const createBatch = async (
  exec: DbExecutor,
  input: CreateBatchInput,
): Promise<ImportBatch> => {
  const [row] = await exec
    .insert(importBatches)
    .values({
      orgId: input.orgId,
      channelId: input.channelId,
      fileName: input.fileName,
      r2ObjectKey: input.r2ObjectKey,
      fileSize: input.fileSize,
      checksum: input.checksum,
      uploadedBy: input.uploadedBy,
      status: 'uploaded',
    })
    .returning();

  if (!row) throw new Error('Insert into import_batches returned no row');
  return row;
};

export interface UpdateBatchInput {
  status?: ImportStatus;
  rowsRead?: number;
  ordersParsed?: number;
  issues?: ParseIssue[];
  errorMessage?: string;
  appliedAt?: Date;
}

/** Move a batch along its lifecycle. See IMPORT_STATUSES in @stockhub/core. */
export const updateBatch = async (
  exec: DbExecutor,
  batchId: ImportBatchId,
  patch: UpdateBatchInput,
): Promise<void> => {
  await exec.update(importBatches).set(patch).where(eq(importBatches.id, batchId));
};

export const getBatch = async (
  exec: DbExecutor,
  params: { orgId: OrgId; batchId: ImportBatchId },
): Promise<ImportBatch | undefined> => {
  const [row] = await exec
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.orgId, params.orgId), eq(importBatches.id, params.batchId)))
    .limit(1);
  return row;
};

export const listBatches = async (
  exec: DbExecutor,
  params: { orgId: OrgId; limit?: number; offset?: number },
): Promise<ImportBatch[]> =>
  exec
    .select()
    .from(importBatches)
    .where(eq(importBatches.orgId, params.orgId))
    .orderBy(desc(importBatches.createdAt))
    .limit(params.limit ?? 20)
    .offset(params.offset ?? 0);

/**
 * The preview screen payload: every parsed order line with its match state.
 *
 * TODO(template): the parsed orders are already stored as `orders` +
 * `order_lines` rows with status 'pending' and match_source 'unmatched'.
 * Select them by import_batch_id, LEFT JOIN variants, and return the lines
 * grouped by order so the user can fix the unmatched ones.
 */
export const getBatchPreview = async (
  _exec: DbExecutor,
  _params: { orgId: OrgId; batchId: ImportBatchId },
): Promise<never> => {
  throw new NotImplementedError('getBatchPreview');
};

/**
 * Apply a previewed batch: turn its orders into stock movements.
 *
 * TODO(template). This is THE transaction of the product:
 *   BEGIN
 *     set status = 'applying'
 *     for each order in the batch that still needs stock:
 *       expandBundles(lines)                       -- core/services/stock/bundle
 *       getOpenLotsForUpdate() per variant         -- locks the layers
 *       planMovements()                            -- core/services/stock/movement
 *       recordMovements()                          -- ledger + lots + consumptions
 *     set status = 'applied', applied_at = now()
 *   COMMIT
 * Any throw rolls the whole batch back, which is exactly what the shop owner
 * expects: a file is applied completely or not at all.
 */
export const applyBatch = async (
  _exec: DbExecutor,
  _params: { orgId: OrgId; batchId: ImportBatchId; actorId: UserId },
): Promise<void> => {
  throw new NotImplementedError('applyBatch');
};

/** Count batches in one status - the dashboard's pending-imports counter. */
export const countBatchesByStatus = async (
  exec: DbExecutor,
  params: { orgId: OrgId; status: ImportStatus },
): Promise<number> => {
  const [row] = await exec
    .select({ total: sql<number>`count(*)::int`.as('total') })
    .from(importBatches)
    .where(and(eq(importBatches.orgId, params.orgId), eq(importBatches.status, params.status)));
  return Number(row?.total ?? 0);
};
