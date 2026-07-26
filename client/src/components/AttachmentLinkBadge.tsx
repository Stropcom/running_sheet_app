import { Target, Car, User, MapPin, Link2, Link2Off } from "lucide-react";

const CATEGORY_ICON: Record<string, typeof Target> = {
  target: Target,
  vehicle: Car,
  associate: User,
  location: MapPin,
};

const CATEGORY_LABEL: Record<string, string> = {
  target: "a target",
  vehicle: "a vehicle",
  associate: "a person",
  location: "a location",
};

/**
 * The small circular badge shown on a photo thumbnail indicating whether
 * it's linked to an Intelligence entity, and to what kind — a category
 * icon when every link is the same category, a generic link icon when it
 * spans more than one. Click opens LinkAttachmentDialog, which shows the
 * current links (with unlink) and lets you add more.
 *
 * Deliberately kept to the same single small badge the app already used
 * (no extra icons/labels on the thumbnail itself) — the actual entity
 * name(s) only show once you tap through, to keep image grids uncluttered.
 */
export function AttachmentLinkBadge({
  linkedCount,
  linkedCategories,
  onClick,
  className = "h-6 w-6",
}: {
  linkedCount: number;
  linkedCategories?: string[];
  onClick: () => void;
  /** Full class list for size/position — defaults to just a size, no positioning. */
  className?: string;
}) {
  const categories = linkedCategories ?? [];
  const isLinked = linkedCount > 0;
  const Icon = !isLinked
    ? Link2Off
    : categories.length === 1
      ? (CATEGORY_ICON[categories[0]] ?? Link2)
      : Link2;
  const title = !isLinked
    ? "Not linked to an entity — click to link"
    : categories.length === 1
      ? `Linked to ${CATEGORY_LABEL[categories[0]] ?? "an entity"} — click to view or link another`
      : "Linked to multiple entities — click to view or link another";

  return (
    <button
      onClick={onClick}
      title={title}
      className={`${className} rounded-full flex items-center justify-center transition-colors ${
        isLinked
          ? "bg-emerald-600/90 text-white hover:bg-emerald-500"
          : "bg-amber-500/90 text-white hover:bg-amber-400"
      }`}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
