'use client';

/**
 * Left navigation. The order follows the sales demo script:
 *   1. Dashboard - "this is your whole business on one screen"
 *   2. สต็อก - "one stock pool for every channel"
 *   3. นำเข้าออเดอร์ - the import flow, the core of the pitch
 *   4. ออเดอร์ / ความเคลื่อนไหว - the audit trail
 *   5. รายงาน / ตั้งค่า
 *
 * A nav item with `permission` disappears for roles that lack it. The cost
 * report is hidden entirely, not shown-and-blocked, because that is what the
 * customer asked for.
 */

import { useRole } from '@/components/role-provider';
import { cn } from '@/lib/cn';
import type { Permission } from '@stockhub/core';
import {
  ArrowLeftRight,
  BarChart3,
  FileSpreadsheet,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Tags,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Hidden when the current role lacks this permission. */
  permission?: Permission;
  /** Extra path prefixes that should keep this item highlighted. */
  match?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/inventory', label: 'สต็อกสินค้า', icon: Package },
  { href: '/imports', label: 'นำเข้าออเดอร์', icon: FileSpreadsheet, permission: 'import:run' },
  { href: '/orders', label: 'ออเดอร์', icon: ShoppingCart, permission: 'order:read' },
  { href: '/movements', label: 'ความเคลื่อนไหวสต็อก', icon: ArrowLeftRight },
  { href: '/customers', label: 'ลูกค้า', icon: Users, permission: 'customer:read' },
  {
    href: '/settings/price-tiers',
    label: 'ระดับราคา',
    icon: Tags,
    permission: 'price_tier:read',
    match: ['/settings/price-tiers'],
  },
  {
    href: '/reports/cogs',
    label: 'รายงานต้นทุน',
    icon: BarChart3,
    permission: 'cost:read',
    match: ['/reports'],
  },
  { href: '/settings/channels', label: 'ตั้งค่าช่องทางขาย', icon: Settings, match: ['/settings'] },
];

const isActive = (pathname: string, item: NavItem): boolean => {
  if (item.href === '/') return pathname === '/';
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission } = useRole();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
          SH
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">StockHub</p>
          <p className="text-[11px] text-slate-500">ระบบสต็อกหลายช่องทาง</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.filter((item) => !item.permission || hasPermission(item.permission)).map(
          (item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-emerald-50 font-medium text-emerald-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icon className={cn('size-4', active ? 'text-emerald-600' : 'text-slate-400')} />
                {item.label}
              </Link>
            );
          },
        )}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <p className="text-[11px] leading-relaxed text-slate-400">
          เวอร์ชันสาธิต - ข้อมูลบางส่วนเป็นข้อมูลตัวอย่าง
        </p>
      </div>
    </aside>
  );
}
