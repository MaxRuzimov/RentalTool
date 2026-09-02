import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="mt-6 h-8 w-2/3" />
      <Skeleton className="mt-2 h-5 w-24" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <div className="mt-6 flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
