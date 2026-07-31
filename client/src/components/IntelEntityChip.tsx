import { useState } from "react";
import { User, Car, MapPin } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import {
  formatAttachmentBanner,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";

// Shared across every Intelligence profile page (Target/Operation/Associate/
// Vehicle/Location) so the "chip + its own linked photos grouped directly
// beneath it" pattern stays identical everywhere, on both web and PDF export.

export type IntelEntityPhoto = RowAttachmentLike & { id: number; url: string };

export interface IntelAssocEntity {
  id: string;
  label: string;
  type: string;
  rowCount: number;
  photos?: IntelEntityPhoto[];
  /** True when this vehicle/location matches a value superseded by a target-merge. */
  isPrevious?: boolean;
}

export const INTEL_CHIP_CLASSES: Record<string, string> = {
  person: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  vehicle:
    "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  address:
    "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  business:
    "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  target: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
};

export function IntelEntityChip({
  item,
  onClick,
}: {
  item: IntelAssocEntity;
  onClick?: () => void;
}) {
  const cls =
    INTEL_CHIP_CLASSES[item.type] ??
    "bg-muted text-muted-foreground border-border";
  const icon =
    item.type === "vehicle" ? (
      <Car className="w-3 h-3" />
    ) : item.type === "address" || item.type === "business" ? (
      <MapPin className="w-3 h-3" />
    ) : (
      <User className="w-3 h-3" />
    );
  const label =
    item.type === "vehicle"
      ? formatIntelVehicle(item.label)
      : item.type === "address" || item.type === "business"
        ? formatIntelAddress(item.label)
        : item.label;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${cls}`}
    >
      {icon}
      {label}
      <span className="opacity-60">×{item.rowCount}</span>
      {item.isPrevious && (
        <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-black/10 dark:bg-white/15">
          Previous
        </span>
      )}
    </button>
  );
}

export function IntelPhotoStrip({
  photos,
  size = "w-16 h-16",
}: {
  photos: IntelEntityPhoto[];
  size?: string;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {photos.map(p => (
          <button
            key={p.id}
            onClick={() => setLightbox(p.url)}
            title={formatAttachmentBanner(p)}
            className={`${size} rounded-md overflow-hidden border border-border/60 shrink-0 hover:opacity-80 transition-opacity`}
          >
            <img
              src={p.url}
              alt="Linked photograph"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Linked photograph"
            className="max-w-full max-h-full rounded shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

// Pairs a chip with its own photos directly beneath it, so which photo
// belongs to which entity is unambiguous even when several entities in the
// same category (e.g. two associated persons) each have photos of their own.
export function IntelEntityWithPhotos({
  item,
  onClick,
}: {
  item: IntelAssocEntity;
  onClick?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <IntelEntityChip item={item} onClick={onClick} />
      {(item.photos ?? []).length > 0 && (
        <div className="pl-1">
          <IntelPhotoStrip photos={item.photos!} size="w-14 h-14" />
        </div>
      )}
    </div>
  );
}
