/**
 * StoragePort implemented over the R2 binding.
 *
 * Why the port and not R2 directly: `packages/core` and the services must stay
 * runtime free, so they receive a StoragePort. Tests inject an in-memory map,
 * the Worker injects this.
 *
 * Retention rule from the domain: never delete an uploaded order export. It is
 * the evidence behind every stock movement it produced. `delete` exists for the
 * abort path (upload failed validation before a batch row was committed).
 */

import { NotImplementedError } from '@stockhub/core';
import type { StoragePort, StoredObject } from '@stockhub/core';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const toStoredObject = (key: string, object: R2Object): StoredObject => ({
  key,
  size: object.size,
  contentType: object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE,
  uploadedAt: object.uploaded,
});

export const createR2Storage = (bucket: R2Bucket): StoragePort => ({
  async put(key, body, contentType) {
    // R2 accepts the raw bytes. `httpMetadata` is what a later download echoes
    // back as Content-Type, so set it at write time.
    const written = await bucket.put(key, body, {
      httpMetadata: { contentType: contentType || DEFAULT_CONTENT_TYPE },
    });
    if (!written) {
      // Only happens when onlyIf preconditions fail; we send none, so treat as fatal.
      throw new Error(`R2 put returned null for ${key}`);
    }
    return toStoredObject(key, written);
  },

  async get(key) {
    const object = await bucket.get(key);
    if (!object) return null;
    const buffer = await object.arrayBuffer();
    return new Uint8Array(buffer);
  },

  async head(key) {
    const object = await bucket.head(key);
    return object ? toStoredObject(key, object) : null;
  },

  async delete(key) {
    await bucket.delete(key);
  },

  async signedUrl(_key, _expiresInSeconds) {
    /**
     * R2 presigned URLs are an S3-API feature. A Worker with an R2 *binding*
     * cannot mint one: it has no access key to sign with.
     *
     * Two supported ways to finish this:
     *   1. Proxy route (recommended for this app): add
     *      GET /api/v1/imports/:id/file, check the caller's org and permission,
     *      then stream `bucket.get(key).body` back. Access control stays in one
     *      place and no URL can leak.
     *   2. True presigned URL: store R2 S3 credentials as Worker secrets and
     *      sign with aws4fetch against
     *      https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>.
     *      Use this only if a third party must download without hitting the API.
     */
    throw new NotImplementedError('R2 signedUrl (add a proxy download route instead)');
  },
});
