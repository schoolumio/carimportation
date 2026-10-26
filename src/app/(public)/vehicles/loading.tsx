import { VehicleCardSkeleton } from "@/components/VehicleCard";
export default function Loading() {
  return (
    <div className="container-page py-8">
      <div className="skeleton mb-6 h-8 w-64" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <VehicleCardSkeleton key={i} />)}</div>
    </div>
  );
}
