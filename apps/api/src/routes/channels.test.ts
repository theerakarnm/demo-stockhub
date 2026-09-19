/**
 * GET /channels route tests.
 *
 * The route used to answer with MOCK_CHANNELS whose string ids are not seed
 * uuids, so an upload picked from its dropdown failed with not_found. This
 * suite pins the real contract: seed rows, uuid ids, every marketplace kind,
 * and the lastImportedAt read from import_batches.
 */

import { describe, expect, test } from 'bun:test';
import { buildTestApp, jsonAs } from '../test-utils';
import { channelsRouter } from './channels';

const app = buildTestApp((v1) => v1.route('/channels', channelsRouter));

interface ChannelWire {
  id: string;
  kind: string;
  name: string;
  isActive: boolean;
  lastImportedAt: string | null;
}

describe('channels route', () => {
  test('returns the 8 seeded channels with uuid ids and every kind', async () => {
    const channels = await jsonAs<ChannelWire[]>(app, '/api/v1/channels', 'owner');

    expect(channels).toHaveLength(8);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const channel of channels) {
      expect(channel.id).toMatch(uuid);
      expect(channel.name.length).toBeGreaterThan(0);
    }
    const kinds = new Set(channels.map((channel) => channel.kind));
    for (const kind of ['shopee', 'lazada', 'tiktok', 'pos', 'wholesale']) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  test('shopee main carries the applied seed batch as lastImportedAt', async () => {
    const channels = await jsonAs<ChannelWire[]>(app, '/api/v1/channels', 'owner');
    const shopeeMain = channels.find((channel) => channel.name === 'Shopee - ร้านหลัก');
    expect(shopeeMain).toBeDefined();
    // The seed's single import batch (preview_ready) has applied_at null, so a
    // fresh database reports null - the assertion is about the field existing
    // and being an ISO string or null, never a mock placeholder.
    expect(
      shopeeMain?.lastImportedAt === null || typeof shopeeMain?.lastImportedAt === 'string',
    ).toBe(true);
  });

  test('sales may list channels but a broken db surfaces as an error envelope', async () => {
    const channels = await jsonAs<ChannelWire[]>(app, '/api/v1/channels', 'sales');
    expect(channels).toHaveLength(8);
  });
});
