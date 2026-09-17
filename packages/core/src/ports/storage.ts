/**
 * Object storage port. Implemented by Cloudflare R2 in the Worker, and by a
 * local folder / in-memory map in tests. Keep every original upload forever -
 * it is the evidence trail when a customer disputes a stock number.
 */

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
}

export interface StoragePort {
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Pre-signed download URL for the original file. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/**
 * Canonical R2 key layout. Keep it sortable and org-scoped:
 *   imports/{orgId}/{yyyy}/{mm}/{importBatchId}/{originalFileName}
 */
export const importObjectKey = (input: {
  orgId: string;
  importBatchId: string;
  fileName: string;
  now?: Date;
}): string => {
  const now = input.now ?? new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = input.fileName.replace(/[^\w.\-]+/g, '_');
  return `imports/${input.orgId}/${yyyy}/${mm}/${input.importBatchId}/${safeName}`;
};
