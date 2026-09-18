/**
 * Import batch lifecycle.
 *
 * The batch row is created the moment the file lands in R2, before any parsing,
 * so a crash mid-parse still leaves a visible 'failed' record with the original
 * file attached instead of a silent gap.
 */

import type {
  ChannelId,
  ChannelKind,
  ImportBatchId,
  ImportStatus,
  OrgId,
  ParseIssue,
  UserId,
} from '@stockhub/core';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../client';
import { type ImportBatch, type ImportPreviewPayload, importBatches } from '../schema';

export interface CreateBatchInput {
  orgId: OrgId;
  /**
   * Set by callers that generate the id BEFORE the insert, so the R2 object
   * key can contain it. Defaults to the database's gen_random_uuid().
   */
  id?: ImportBatchId;
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
      ...(input.id ? { id: input.id } : {}),
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
  channelId?: ChannelId;
  /** Set once the adapter registry named the platform. */
  detectedKind?: ChannelKind;
  /** Why the detector picked the adapter, shown on the preview screen. */
  detectionReason?: string;
  rowsRead?: number;
  ordersParsed?: number;
  issues?: ParseIssue[];
  errorMessage?: string;
  appliedAt?: Date;
  /** The parsed preview payload. One write per batch, rebuilt by getImportPreview. */
  preview?: ImportPreviewPayload | null;
}

/** Move a batch along its lifecycle. See IMPORT_STATUSES in @stockhub/core. */
export const updateBatch = async (
  exec: DbExecutor,
  batchId: ImportBatchId,
  patch: UpdateBatchInput,
): Promise<void> => {
  await exec.update(importBatches).set(patch).where(eq(importBatches.id, batchId));
};

/** The same row with the FOR UPDATE lock an apply transaction needs. */
export const getBatchForUpdate = async (
  exec: DbExecutor,
  params: { orgId: OrgId; batchId: ImportBatchId },
): Promise<ImportBatch | undefined> => {
  const [row] = await exec
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.orgId, params.orgId), eq(importBatches.id, params.batchId)))
    .limit(1)
    .for('update');
  return row;
};

/**
 * A previously APPLIED batch with the same file digest. The checksum alone is
 * not an error: the shop may re-upload an unchanged file, so the caller only
 * uses this to warn and to skip already-deducted orders in the preview.
 */
export const findAppliedBatchByChecksum = async (
  exec: DbExecutor,
  params: { orgId: OrgId; checksum: string; excludeBatchId?: ImportBatchId },
): Promise<ImportBatch | undefined> => {
  const [row] = await exec
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.orgId, params.orgId),
        eq(importBatches.checksum, params.checksum),
        eq(importBatches.status, 'applied'),
        params.excludeBatchId ? sql`${importBatches.id} <> ${params.excludeBatchId}` : undefined,
      ),
    )
    .limit(1);
  return row;
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
 * The preview is NOT rebuilt from order rows here on purpose: until Apply,
 * the parsed orders live in `import_batches.preview` (one jsonb write per
 * batch), and the service layer maps them onto the wire contract. Reading
 * order_lines instead would double the source of truth for the same preview.
 *
 * Applying is likewise owned by apps/api/src/services/import-service.ts, whose
 * applyImport() runs the whole eight-step transaction (orders upsert, bundle
 * expansion, FOR UPDATE lot locks, planMovements, ledger writes) on the
 * caller's transaction.
 */
