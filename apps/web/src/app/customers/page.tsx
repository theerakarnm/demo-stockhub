'use client';

/**
 * /customers - the shop's customer list with the tier each one bills at.
 *
 * Every fetch goes through customersApi; the drawer reuses CustomerForm for
 * both create and edit. The tier column exists only for roles with
 * `price_tier:read` - stock_staff cannot even open this page.
 */

import { CustomerForm } from '@/components/customers/customer-form';
import { useDebouncedValue } from '@/components/inventory/use-debounced-value';
import { useRole } from '@/components/role-provider';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Table,
  TableSkeleton,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import { customersApi } from '@/lib/api-pricing';
import type { CustomerView } from '@/lib/api-types-pricing';
import { useApi } from '@/lib/use-api';
import { UserPlus, Users } from 'lucide-react';
import { useState } from 'react';

export default function CustomersPage() {
  const { role, hasPermission } = useRole();
  const canWrite = hasPermission('customer:write');
  const canReadTiers = hasPermission('price_tier:read');

  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const [editor, setEditor] = useState<{ open: boolean; customer: CustomerView | null }>({
    open: false,
    customer: null,
  });

  const { data, error, loading, reload } = useApi(() => customersApi.list(q), [q, role]);
  const customers = data ?? [];
  const isEmpty = !loading && !error && customers.length === 0;

  const closeDrawer = () => setEditor({ open: false, customer: null });

  return (
    <>
      <PageHeader
        title="ลูกค้า"
        description="รายชื่อลูกค้าและระดับราคาที่ใช้คิดเงินในบิลขายหน้าร้าน"
        actions={
          canWrite ? (
            <Button onClick={() => setEditor({ open: true, customer: null })}>
              <UserPlus className="size-4" aria-hidden />
              เพิ่มลูกค้า
            </Button>
          ) : null
        }
      />

      <div className="mb-4 max-w-sm">
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหาชื่อหรือเบอร์โทรลูกค้า"
          aria-label="ค้นหาลูกค้า"
        />
      </div>

      {loading && !data ? <TableSkeleton rows={6} cols={4} /> : null}

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : null}

      {isEmpty ? (
        <Card>
          <EmptyState
            title="ยังไม่มีลูกค้า"
            description="เพิ่มลูกค้าเพื่อตั้งระดับราคาที่ใช้คิดเงินอัตโนมัติในบิลขาย"
            icon={<Users className="size-5" aria-hidden />}
            action={
              canWrite ? (
                <Button variant="outline" onClick={() => setEditor({ open: true, customer: null })}>
                  เพิ่มลูกค้า
                </Button>
              ) : null
            }
          />
        </Card>
      ) : null}

      {!error && customers.length > 0 ? (
        <Card>
          <CardBody className="p-0">
            <TableWrap>
              <Table>
                <Thead>
                  <Tr>
                    <Th>ชื่อ</Th>
                    <Th>โทร</Th>
                    {canReadTiers ? <Th>ระดับราคา</Th> : null}
                    <Th>สถานะ</Th>
                    <Th>
                      <span className="sr-only">จัดการ</span>
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {customers.map((customer) => (
                    <Tr key={customer.id}>
                      <Td className="font-medium text-slate-900">{customer.name}</Td>
                      <Td className="font-mono text-xs text-slate-600">{customer.phone ?? '-'}</Td>
                      {canReadTiers ? <Td>{customer.priceTierName ?? 'ปลีก (ค่าเริ่มต้น)'}</Td> : null}
                      <Td>
                        <Badge tone={customer.isActive ? 'success' : 'neutral'}>
                          {customer.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        {canWrite ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditor({ open: true, customer })}
                          >
                            แก้ไข
                          </Button>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      ) : null}

      <Drawer
        open={editor.open}
        onClose={closeDrawer}
        title={editor.customer ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}
        description="ระดับราคาจะถูกใช้อัตโนมัติเมื่อเลือกลูกค้าในบิลขาย"
      >
        <div className="px-5 py-4">
          {editor.open ? (
            <CustomerForm
              customer={editor.customer}
              onSaved={() => {
                closeDrawer();
                reload();
              }}
              onCancel={closeDrawer}
            />
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
