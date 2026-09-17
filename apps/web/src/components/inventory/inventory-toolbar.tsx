'use client';

/**
 * Filter bar of /inventory. Purely controlled: the page owns the filter state
 * so the fetch key and the UI can never disagree.
 */

import { useRole } from '@/components/role-provider';
import { Button, SearchInput, Select } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import { api } from '@/lib/api-client';
import { qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { Filter } from 'lucide-react';

export interface InventoryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  channelId: string;
  onChannelChange: (value: string) => void;
  lowStockOnly: boolean;
  onLowStockToggle: () => void;
  /** Rows currently on screen. Undefined while the first page loads. */
  count?: number;
  loading: boolean;
}

export function InventoryToolbar({
  search,
  onSearchChange,
  channelId,
  onChannelChange,
  lowStockOnly,
  onLowStockToggle,
  count,
  loading,
}: InventoryToolbarProps) {
  const { role } = useRole();
  // Channels are not cost-gated, but the role still belongs in the key: the
  // whole app refetches on a role switch and this list must follow.
  const { data: channels } = useApi(() => api.getChannels(), [role]);

  const channelOptions: SelectOption[] = (channels ?? []).map((channel) => ({
    value: channel.id,
    label: channel.name,
  }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-64">
        <SearchInput
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="ค้นหาชื่อสินค้า / SKU"
          aria-label="ค้นหาชื่อสินค้า หรือ SKU"
        />
      </div>

      <div className="w-full sm:w-52">
        <Select
          value={channelId}
          onChange={(event) => onChannelChange(event.target.value)}
          options={channelOptions}
          placeholder="ทุกช่องทาง"
          aria-label="กรองตามช่องทางขาย"
        />
      </div>

      <Button
        variant={lowStockOnly ? 'primary' : 'outline'}
        size="md"
        aria-pressed={lowStockOnly}
        onClick={onLowStockToggle}
      >
        <Filter className="size-3.5" aria-hidden />
        เฉพาะสินค้าใกล้หมด
      </Button>

      <span className="ml-auto text-xs text-slate-500">
        {loading && count === undefined ? 'กำลังโหลด...' : `แสดง ${qty(count ?? 0)} รายการ`}
      </span>
    </div>
  );
}
