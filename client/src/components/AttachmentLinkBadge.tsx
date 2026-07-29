import { Link2Off } from "lucide-react";

/**
 * Shown on a photo thumbnail only when it has NO links yet — an amber
 * "unlinked" icon, click to open LinkAttachmentDialog. Once a photo is
 * linked to at least one entity, this renders nothing: LinkedEntityPills
 * (the pill row under the thumbnail showing which entity/entities it's
 * linked to) is now the click target for viewing/editing links instead —
 * no separate green icon on top of the image for that case anymore.
 */
export function AttachmentLinkBadge({
  linkedCount,
  onClick,
  positionClassName = "absolute top-1.5 left-1.5",
  iconSize = "h-4 w-4 sm:h-5 sm:w-5",
  glyphSize = "h-2.5 w-2.5 sm:h-3 sm:w-3",
}: {
  linkedCount: number;
  onClick: () => void;
  /** Positioning only (e.g. "absolute top-1.5 left-1.5") — sizing is separate. */
  positionClassName?: string;
  /** Size of the icon circle, responsive-capable (e.g. "h-4 w-4 sm:h-5 sm:w-5"). */
  iconSize?: string;
  /** Size of the glyph inside the circle. */
  glyphSize?: string;
}) {
  if (linkedCount > 0) return null;

  return (
    <button
      onClick={onClick}
      title="Not linked to an entity — click to link"
      className={`${positionClassName} ${iconSize} rounded-full flex items-center justify-center transition-colors bg-amber-500/90 text-white hover:bg-amber-400`}
    >
      <Link2Off className={glyphSize} />
    </button>
  );
}
