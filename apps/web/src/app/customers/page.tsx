'use client';

/**
 * /customers - the wholesale counter's customer book.
 *
 * Search hits the API on every keystroke pause (deferred value), so the list
 * never goes stale. The tier column exists only for roles with
 * price_tier:read; a customer without a tier prices at the default tier,
 * which is what "ปลีก (ค่าเริ่มต้น)" communicates.
 */

import { CustomerForm } from '@/components/customers/customer-form';
import { useRole } from '@/components/role-provider';
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Table,
  TableWrap,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import { customersApi } from '@/lib/api-pricing';
import type { CustomerView } from '@/lib/api-types-pricing';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { Plus, UserRound } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

export default function CustomersPage() {
  const { role, hasPermission } = useRole();
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q);
  const [editing, setEditing] = useState<CustomerView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, error, loading, reload } = useApi(
    () => customersApi.list(deferredQ),
    [deferredQ, role],
  );

  const customers = data ?? [];
  const isEmpty = !loading && !error && customers.length === 0;

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (customer: CustomerView) => {
    setEditing(customer);
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      <PageHeader
        title="ลูกค้า"
        description="สมุดลูกค้าขายส่ง ผูกระดับราคาไว้ที่ลูกค้าเพื่อเปิดบิลได้เร็ว"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            เพิ่มลูกค้า
          </Button>
        }
      />

      <div className="mb-4 max-w-md">
        <SearchInput
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="ค้นหาด้วยชื่อหรือเบอร์โทร"
          aria-label="ค้นหาลูกค้า"
        />
      </div>

      {loading && !data ? <CardSkeleton /> : null}

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={reload} />
        </Card>
      ) : null}

      {isEmpty ? (
        <Card>
          <EmptyState
            title="ยังไม่มีลูกค้า"
            description="เพิ่มลูกค้าเพื่อผูกระดับราคาและเปิดบิลขายส่งได้เร็วขึ้น"
            icon={<UserRound className="size-5" aria-hidden />}
            action={
              <Button onClick={openCreate} variant="outline">
                เพิ่มลูกค้า
              </Button>
            }
          />
        </Card>
      ) : null}

      {!error && customers.length > 0 ? (
        <TableWrap>
          <Table>
            <Thead>
              <Tr>
                <Th>ชื่อ</Th>
                <Th>โทร</Th>
                {hasPermission('price_tier:read') ? <Th>ระดับราคา</Th> : null}
                <Th>สถานะ</Th>
                <Th>สร้างเมื่อ</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {customers.map((customer) => (
                <Tr key={customer.id}>
                  <Td className="font-medium text-slate-900">{customer.name}</Td>
                  <Td>{customer.phone ?? '-'}</Td>
                  {hasPermission('price_tier:read') ? (
                    <Td>{customer.priceTierName ?? 'ปลีก (ค่าเริ่มต้น)'}</Td>
                  ) : null}
                  <Td>
                    <Badge tone={customer.isActive ? 'success' : 'neutral'}>
                      {customer.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500">{formatDate(customer.createdAt)}</Td>
                  <Td>
                    <Button variant="outline" size="sm" onClick={() => openEdit(customer)}>
                      แก้ไข
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}
        description="ระดับราคาใช้เป็นค่าเริ่มต้นเมื่อเปิดบิลให้ลูกค้าคนนี้"
      >
        <CustomerForm
          customer={editing}
          onSaved={() => {
            closeDrawer();
            reload();
          }}
          onCancel={closeDrawer}
        />
      </Drawer>
    </>
  );
}
