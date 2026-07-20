import { trpc } from "@/lib/trpc";
import { X, Link2Off } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PERTH_TIME_ZONE = "Australia/Perth";

function formatBanner(a: { createdAt: string | Date; uploadedByCIN: string | null }): string {
  const dateStr = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(a.createdAt));
  return a.uploadedByCIN ? `${dateStr} · ${a.uploadedByCIN}` : dateStr;
}

/** Shows photos linked to one Intelligence entity (Target/Vehicle/Associate/Location). */
export function EntityPhotosSection({
  category,
  targetId,
  entityLabel,
}: {
  category: "target" | "vehicle" | "associate" | "location";
  targetId?: number;
  entityLabel?: string;
}) {
  const utils = trpc.useUtils();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { data: photos } = trpc.attachment.byEntity.useQuery({ category, targetId, entityLabel });

  const unlink = trpc.attachment.unlinkFromEntity.useMutation({
    onSuccess: () => {
      utils.attachment.byEntity.invalidate({ category, targetId, entityLabel });
      utils.attachment.entityLinkCounts.invalidate();
      toast.success("Photo unlinked");
    },
    onError: e => toast.error(e.message),
  });

  if (!photos || photos.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Photos</p>
        <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{photos.length}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {(photos as any[]).map(p => (
          <div key={p.id} className="group relative rounded-lg overflow-hidden border border-border bg-muted/20">
            <img
              src={p.url}
              alt="Linked photograph"
              className="w-full aspect-square object-cover cursor-zoom-in"
              onClick={() => setLightbox(p.url)}
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5">
              <p className="text-[9px] text-white truncate">{formatBanner(p)}</p>
            </div>
            <button
              onClick={() => unlink.mutate({ linkId: p.linkId })}
              title="Unlink photo"
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Link2Off className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="Linked photograph" className="max-w-full max-h-full rounded shadow-2xl" />
        </div>
      )}
    </div>
  );
}
