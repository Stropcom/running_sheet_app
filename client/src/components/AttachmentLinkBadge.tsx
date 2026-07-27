import { Target, Car, User, MapPin, HelpCircle, Link2Off } from "lucide-react";

const CATEGORY_ICON: Record<string, typeof Target> = {
  target: Target,
  vehicle: Car,
  associate: User,
  location: MapPin,
  unidentified_person: HelpCircle,
};

const CATEGORY_LABEL: Record<string, string> = {
  target: "a target",
  vehicle: "a vehicle",
  associate: "a person",
  location: "a location",
  unidentified_person: "an unidentified person",
};

/**
 * Shown on a photo thumbnail indicating whether/what it's linked to. Click
 * (anywhere in the row) opens LinkAttachmentDialog, which shows the current
 * links (with unlink) and lets you add more.
 *
 * Not linked: a single amber "unlinked" icon, same as before.
 * Linked: one small green icon per distinct entity *category* linked (target/
 * vehicle/person/location) laid out across the top of the image — e.g. linked
 * to a target and a person shows two icons, not one generic "linked" icon.
 * Multiple links within the same category (e.g. two people) still collapse
 * to one icon for that category, so this can't grow past 4 icons.
 */
export function AttachmentLinkBadge({
  linkedCount,
  linkedCategories,
  onClick,
  positionClassName = "absolute top-1.5 left-1.5",
  iconSize = "h-4 w-4 sm:h-5 sm:w-5",
  glyphSize = "h-2.5 w-2.5 sm:h-3 sm:w-3",
}: {
  linkedCount: number;
  linkedCategories?: string[];
  onClick: () => void;
  /** Positioning only (e.g. "absolute top-1.5 left-1.5") — sizing is separate. */
  positionClassName?: string;
  /** Size of each icon circle, responsive-capable (e.g. "h-4 w-4 sm:h-5 sm:w-5"). */
  iconSize?: string;
  /** Size of the glyph inside each circle. */
  glyphSize?: string;
}) {
  const categories = Array.from(new Set(linkedCategories ?? []));
  const isLinked = linkedCount > 0;

  if (!isLinked) {
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

  return (
    <button
      onClick={onClick}
      title={`Linked to ${categories.map((c) => CATEGORY_LABEL[c] ?? "an entity").join(", ")} — click to view or link another`}
      className={`${positionClassName} flex items-center gap-1`}
    >
      {categories.map((cat) => {
        const Icon = CATEGORY_ICON[cat] ?? HelpCircle;
        return (
          <span
            key={cat}
            className={`${iconSize} rounded-full flex items-center justify-center bg-emerald-600/90 text-white transition-colors hover:bg-emerald-500`}
          >
            <Icon className={glyphSize} />
          </span>
        );
      })}
    </button>
  );
}
