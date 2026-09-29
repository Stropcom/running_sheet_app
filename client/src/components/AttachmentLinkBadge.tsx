import { Link2Off } from "lucide-react";

/**
 * Shown on a photo thumbnail until it's *fully* linked — not just linked to
 * something, but linked to everything isAttachmentProperlyLinked requires
 * (a person link when a face is detected, a CIN/member link when its row
 * has members). A photo with some but not all of those links still shows
 * this amber icon alongside LinkedEntityPills (which shows what IS linked)
 * rather than the two being mutually exclusive, so it stays visible — and
 * Governance keeps counting the photo as unlinked — until every required
 * link is actually made.
 */
export function AttachmentLinkBadge({
  isProperlyLinked,
  hasAnyLink,
  onClick,
  positionClassName = "absolute top-1.5 left-1.5",
  iconSize = "h-4 w-4 sm:h-5 sm:w-5",
  glyphSize = "h-2.5 w-2.5 sm:h-3 sm:w-3",
}: {
  isProperlyLinked: boolean;
  /** For the tooltip only — distinguishes "nothing linked yet" from
   * "partially linked, still missing a required link". */
  hasAnyLink?: boolean;
  onClick: () => void;
  /** Positioning only (e.g. "absolute top-1.5 left-1.5") — sizing is separate. */
  positionClassName?: string;
  /** Size of the icon circle, responsive-capable (e.g. "h-4 w-4 sm:h-5 sm:w-5"). */
  iconSize?: string;
  /** Size of the glyph inside the circle. */
  glyphSize?: string;
}) {
  if (isProperlyLinked) return null;

  return (
    <button
      onClick={onClick}
      title={
        hasAnyLink
          ? "Still missing a required link — click to link"
          : "Not linked to an entity — click to link"
      }
      className={`${positionClassName} ${iconSize} rounded-full flex items-center justify-center transition-colors bg-amber-500/90 text-white hover:bg-amber-400`}
    >
      <Link2Off className={glyphSize} />
    </button>
  );
}
