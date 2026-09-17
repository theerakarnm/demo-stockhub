'use client';

/**
 * /settings/channels - the list of sales channels the org sells through.
 *
 * Read only in this version. Creating and editing a channel needs the
 * channel:write flow on the API, which is still a template gap, so the edit
 * button stays disabled instead of opening a form that cannot save.
 */

import { ChannelBadge } from '@/components/domain-badges';
import { useRole } from '@/components/role-provider';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Channel } from '@/lib/api-types';
import { formatRelative } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import type { ChannelKind } from '@stockhub/core';
import { FileSpreadsheet, Store } from 'lucide-react';

/** Channels whose orders arrive as an export file. */
const ONLINE_KINDS: ChannelKind[] = ['shopee', 'lazada', 'tiktok'];

const GROUPS: Array<{ title: string; description: string; kinds: ChannelKind[] }> = [
  {
    title: 'ช่องทางออนไลน์',
    description: 'รับออเดอร์ด้วยการนำเข้าไฟล์จากมาร์เก็ตเพลส',
    kinds: ONLINE_KINDS,
  },
  {
    title: 'ช่องทางออฟไลน์',
    description: 'บันทึกบิลตรงใน StockHub',
    kinds: ['pos', 'wholesale', 'manual'],
  },
];

function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <Card className="flex flex-col">
      <CardBody className="flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <ChannelBadge kind={channel.kind} />
          <Badge tone={channel.isActive ? 'success' : 'neutral'}>
            {channel.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
          </Badge>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-900">{channel.name}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {channel.externalShopId ?? 'ยังไม่ได้ผูกรหัสร้าน'}
          </p>
        </div>

        <dl className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">นำเข้าล่าสุด</dt>
            <dd className="text-slate-700">
              {channel.lastImportAt ? formatRelative(channel.lastImportAt) : 'ยังไม่เคยนำเข้า'}
            </dd>
          </div>
        </dl>
      </CardBody>
      <div className="border-t border-slate-200 px-4 py-3">
        {/* TODO(template): enable once PATCH /api/v1/channels/:id exists (needs channel:write). */}
        <Button
          variant="outline"
          size="sm"
          disabled
          title="ยังไม่เปิดใช้งานในเวอร์ชันสาธิต"
          className="w-full"
        >
          แก้ไข
        </Button>
      </div>
    </Card>
  );
}

export default function ChannelSettingsPage() {
  const { role } = useRole();
  const { data, error, loading, reload } = useApi(() => api.getChannels(), [role]);

  const channels = data ?? [];
  const isEmpty = !loading && !error && channels.length === 0;

  return (
    <>
      <PageHeader title="ตั้งค่าช่องทางขาย" description="ช่องทางขายทั้งหมดที่เชื่อมกับคลังกลางเดียวกัน" />

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <CardSkeleton key={`channel-skeleton-${index}`} />
          ))}
        </div>
      ) : null}

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : null}

      {isEmpty ? (
        <Card>
          <EmptyState
            title="ยังไม่มีช่องทางขาย"
            description="เพิ่มช่องทางขายเพื่อเริ่มนำเข้าออเดอร์และตัดสต็อกจากคลังกลาง"
            icon={<Store className="size-5" aria-hidden />}
          />
        </Card>
      ) : null}

      {!error && channels.length > 0
        ? GROUPS.map((group) => {
            const groupChannels = channels.filter((channel) => group.kinds.includes(channel.kind));
            if (groupChannels.length === 0) return null;
            return (
              <section key={group.title} className="mb-6">
                <h2 className="text-sm font-semibold text-slate-900">{group.title}</h2>
                <p className="mb-3 text-xs text-slate-500">{group.description}</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {groupChannels.map((channel) => (
                    <ChannelCard key={channel.id} channel={channel} />
                  ))}
                </div>
              </section>
            );
          })
        : null}

      <Card className="bg-slate-50">
        <CardHeader
          title="ออเดอร์เข้าระบบได้สองทาง"
          description="ต่างกันที่ต้นทางของข้อมูล แต่ตัดสต็อกจากคลังเดียวกันเสมอ"
        />
        <CardBody className="space-y-2 text-xs text-slate-600">
          <p className="flex items-start gap-2">
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <span>
              Shopee, Lazada และ TikTok Shop รับออเดอร์ด้วยการอัปโหลดไฟล์ export จากหลังร้าน ระบบจะอ่านไฟล์
              จับคู่ SKU แล้วให้ตรวจสอบก่อนตัดสต็อก
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Store className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <span>หน้าร้าน (POS) และขายส่ง บันทึกบิลตรงในระบบที่หน้าเปิดบิลขาย ระบบตัดสต็อกทันทีที่บันทึก</span>
          </p>
        </CardBody>
      </Card>
    </>
  );
}
