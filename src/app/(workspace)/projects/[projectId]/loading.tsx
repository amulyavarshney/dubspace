import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="animate-in fade-in">
      <Skeleton className="mb-3 h-3 w-40" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-80 rounded-2xl" />
    </div>
  );
}
