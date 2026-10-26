import type { VehicleMedia } from "@prisma/client";
import { Card } from "./ui";
import { VehicleImage } from "./VehicleImage";
import { removeMediaAction, uploadMediaAction } from "@/app/dealer/actions";

export function MediaManager({ listingId, media, back }: { listingId: string; media: VehicleMedia[]; back: string }) {
  return (
    <Card title={`Photos & videos (${media.length})`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {media.map((m) => (
          <div key={m.id} className="overflow-hidden rounded-lg border border-slate-200">
            <div className="aspect-[4/3]">{m.kind === "VIDEO" ? <video src={m.url} className="h-full w-full object-cover" /> : <VehicleImage url={m.url} alt={m.caption ?? "Vehicle"} showLabel={false} />}</div>
            <form action={removeMediaAction} className="p-1 text-right"><input type="hidden" name="mediaId" value={m.id} /><input type="hidden" name="back" value={back} /><button className="text-xs text-danger hover:underline">Remove</button></form>
          </div>
        ))}
      </div>
      <form action={uploadMediaAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="listingId" value={listingId} /><input type="hidden" name="back" value={back} />
        <input type="file" name="file" required accept="image/jpeg,image/png,image/webp,video/mp4" className="text-sm" />
        <input name="caption" className="input w-48" placeholder="Caption" />
        <button className="btn-secondary btn-sm">Upload</button>
      </form>
      <p className="mt-2 text-xs text-slate-500">Upload real photos of this exact vehicle. Stock or reused photos are grounds for removal.</p>
    </Card>
  );
}
