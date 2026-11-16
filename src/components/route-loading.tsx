import { Skeleton } from "@/components/ui/skeleton";

/** Generic page skeleton rendered inside a segment layout while a route loads. */
export function RouteLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-6 py-2">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-9 w-56 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
