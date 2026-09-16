import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewLoading() {
  return (
    <div aria-label="Loading review queue" aria-busy="true">
      <div className="mb-7 border-b pb-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-9 w-56" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="mb-5 h-16 w-full rounded-xl" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, item) => (
          <Skeleton key={item} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
