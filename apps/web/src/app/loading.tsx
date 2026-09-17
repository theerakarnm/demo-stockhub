import { CardSkeleton, Skeleton } from '@/components/ui';

/** Shown while a route segment streams in. Keeps the layout from jumping. */
export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-52" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    </div>
  );
}
