'use client';

/**
 * /inventory - the central stock pool.
 *
 * Every channel sells from this one list, so the numbers here are the single
 * source of truth for "how many do we really have".
 */

import { CostGate, CostLockedNote } from '@/components/cost-value';
import { InventoryTable } from '@/components/inventory/inventory-table';
import { InventoryToolbar } from '@/components/inventory/inventory-toolbar';
import { useDebouncedValue } from '@/components/inventory/use-debounced-value';
import { VariantQuickView } from '@/components/inventory/variant-quick-view';
import { useRole } from '@/components/role-provider';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  buttonClass,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

/**
 * Rows per page. "โหลดเพิ่ม" raises the limit by one page. Kept small so the
 * pagination path is actually exercised with the demo fixtures.
 */
const PAGE_SIZE = 10;

export default function InventoryPage() {
  const { role, hasPermission } = useRole();
  const [search, setSearch] = useState('');
  const [channelId, setChannelId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  // The dashboard links here with ?lowStock=1. Read it after mount so the
  // server-rendered markup and the first client render stay identical.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('lowStock') === '1') setLowStockOnly(true);
  }, []);

  const { data, error, loading, reload } = useApi(
    () =>
      api.getInventory({
        q: debouncedSearch || undefined,
        channelId: channelId || undefined,
        lowStock: lowStockOnly || undefined,
        limit,
      }),
    [debouncedSearch, channelId, lowStockOnly, limit, role],
  );

  const rows = data?.items ?? [];
  const selectedRow = useMemo(
    () => rows.find((row) => row.variantId === selectedVariantId) ?? null,
    [rows, selectedVariantId],
  );

  // Any filter change restarts the list at one page.
  const changeSearch = (value: string) => {
    setSearch(value);
    setLimit(PAGE_SIZE);
  };
  const changeChannel = (value: string) => {
    setChannelId(value);
    setLimit(PAGE_SIZE);
  };
  const toggleLowStock = () => {
    setLowStockOnly((previous) => !previous);
    setLimit(PAGE_SIZE);
  };
  const clearFilters = () => {
    setSearch('');
    setChannelId('');
    setLowStockOnly(false);
    setLimit(PAGE_SIZE);
  };

  const hasFilters = search !== '' || channelId !== '' || lowStockOnly;
  const showEmpty = !loading && !error && rows.length === 0;

  return (
    <>
      <PageHeader
        title="สต็อกสินค้า"
        description="คลังกลางหนึ่งเดียวที่ทุกช่องทางขายใช้ร่วมกัน ยอดที่เห็นคือยอดเดียวกับที่ Shopee, Lazada, TikTok Shop และหน้าร้านตัดออก"
        actions={
          hasPermission('stock:adjust') ? (
            <Link href="/inventory/receive" className={buttonClass('primary', 'sm')}>
              รับสินค้าเข้า
            </Link>
          ) : null
        }
      />

      <Card>
        <CardHeader title="รายการสินค้า" description="คลิกที่แถวเพื่อดูล็อตต้นทุนและยอดคงเหลือแบบย่อ" />
        <CardBody className="border-b border-slate-200 py-3">
          <InventoryToolbar
            search={search}
            onSearchChange={changeSearch}
            channelId={channelId}
            onChannelChange={changeChannel}
            lowStockOnly={lowStockOnly}
            onLowStockToggle={toggleLowStock}
            count={data ? rows.length : undefined}
            loading={loading}
          />
        </CardBody>

        {loading && !data ? <TableSkeleton rows={8} cols={8} /> : null}
        {error ? <ErrorState error={error} onRetry={reload} /> : null}
        {showEmpty ? (
          <EmptyState
            title="ไม่พบสินค้าตามเงื่อนไขที่เลือก"
            description={
              hasFilters
                ? 'ลองล้างตัวกรอง หรือค้นหาด้วยคำที่สั้นลง'
                : 'ยังไม่มีสินค้าในคลัง เริ่มจากการนำเข้าไฟล์ออเดอร์หรือเพิ่มสินค้าก่อน'
            }
            icon={<PackageSearch className="size-5" aria-hidden />}
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  ล้างตัวกรอง
                </Button>
              ) : null
            }
          />
        ) : null}
        {!error && rows.length > 0 ? (
          <InventoryTable
            rows={rows}
            selectedVariantId={selectedVariantId}
            onSelect={setSelectedVariantId}
          />
        ) : null}

        {data && data.nextCursor !== null ? (
          <CardFooter className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              แสดง {qty(rows.length)} รายการแรก ยังมีรายการเพิ่มเติม
            </span>
            {/* TODO(template): the API paginates by cursor. Swap `limit` for
                `cursor: data.nextCursor` and append the new page to a local
                list once the endpoint is live. */}
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
            >
              โหลดเพิ่ม
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <CostGate fallback={<CostLockedNote className="mt-3" />}>
        <p className="mt-3 text-xs text-slate-500">มูลค่าสต็อกคำนวณจากล็อตต้นทุนแบบ FIFO ที่ยังเหลืออยู่จริง</p>
      </CostGate>

      <Drawer
        open={selectedVariantId !== null}
        onClose={() => setSelectedVariantId(null)}
        title={selectedRow?.name ?? 'รายละเอียดสินค้า'}
        description={selectedRow ? `${selectedRow.sku} / หน่วย ${selectedRow.unit}` : undefined}
      >
        {/* The id is the key, so the detail request starts only after a row is
            picked and restarts cleanly when the user picks another row. */}
        {selectedVariantId ? (
          <VariantQuickView key={selectedVariantId} variantId={selectedVariantId} />
        ) : null}
      </Drawer>
    </>
  );
}
