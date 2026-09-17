import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/80', className)} />;
}

/**
 * Stable keys for placeholder rows and cells.
 *
 * The array index is not used as the React key: a skeleton is replaced wholesale
 * when data arrives, and index keys would make React reuse nodes across a length
 * change. These ids are deterministic, so server and client render the same tree.
 */
const KEY_POOL = Array.from({ length: 64 }, (_, index) => `sk${index}`);
const gridKeys = (count: number): string[] =>
  count <= KEY_POOL.length
    ? KEY_POOL.slice(0, count)
    : Array.from({ length: count }, (_, index) => `sk${index}`);

/** Placeholder rows that keep the table height stable while data loads. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {gridKeys(rows).map((rowKey) => (
        <div key={rowKey} className="flex items-center gap-4 px-3 py-3">
          {gridKeys(cols).map((cellKey, colIndex) => (
            <Skeleton
              key={`${rowKey}-${cellKey}`}
              className={cn('h-4', colIndex === 0 ? 'w-1/3' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}
