import { trpc } from "@/lib/trpc";
import { X, Link2Off } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatAttachmentBanner } from "@/lib/attachmentBanner";
import { useLocation } from "wouter";
import { ProfileCard } from "@/components/ProfileKit";
import { PROFILE_PHOTO_GRID, PROFILE_PHOTO_TILE } from "@/lib/pageKit";

/** Shows photos linked to one Intelligence entity (Target/Vehicle/Associate/Location). */
export function EntityPhotosSection({
  category,
  targetId,
  entityLabel,
  showEmpty = false,
  id = "photos",
  label = "Photos",
}: {
  category: "target" | "vehicle" | "associate" | "location";
  targetId?: number;
  entityLabel?: string;
  /** Show a "no photos yet" card instead of nothing (vehicle / location). */
  showEmpty?: boolean;
  id?: string;
  label?: string;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { data: photos } = trpc.attachment.byEntity.useQuery({
    category,
    targetId,
    entityLabel,
  });

  const unlink = trpc.attachment.unlinkFromEntity.useMutation({
    onSuccess: () => {
      utils.attachment.byEntity.invalidate({ category, targetId, entityLabel });
      utils.attachment.entityLinkCounts.invalidate();
      toast.success("Photo unlinked");
    },
    onError: e => toast.error(e.message),
  });

  if (!photos) return null;
  if (photos.length === 0) {
    if (!showEmpty) return null;
    return (
      <ProfileCard id={id} label={label} count={0}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <span>No photos linked yet.</span>
          <button
            type="button"
            onClick={() => navigate("/images")}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted/60"
          >
            Add photo
          </button>
        </div>
      </ProfileCard>
    );
  }

  return (
    <ProfileCard id={id} label={label} count={photos.length}>
      <div className={PROFILE_PHOTO_GRID}>
        {(photos as any[]).map(p => (
          <div key={p.id} className={PROFILE_PHOTO_TILE}>
            <img
              src={p.url}
              alt="Linked photograph"
              className="w-full aspect-square object-cover cursor-zoom-in"
              onClick={() => setLightbox(p.url)}
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
              <p className="text-xs text-white truncate">
                {formatAttachmentBanner(p)}
              </p>
            </div>
            <button
              onClick={() => unlink.mutate({ linkId: p.linkId })}
              title="Unlink photo"
              className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <Link2Off className="h-3 w-3" />
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
          <img
            src={lightbox}
            alt="Linked photograph"
            className="max-w-full max-h-full rounded shadow-2xl"
          />
        </div>
      )}
    </ProfileCard>
  );
}
