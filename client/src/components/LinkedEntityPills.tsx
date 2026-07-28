import { Target, Car, User, MapPin, HelpCircle } from "lucide-react";

const CATEGORY_ICON: Record<string, typeof Target> = {
  target: Target,
  vehicle: Car,
  associate: User,
  location: MapPin,
  unidentified_person: HelpCircle,
};

// A target's registered name is often followed by free-text detail
// ("Benjamin KING, born 9 September 1966") — same convention as
// targetCoreName in db.ts. There's no room for that in a thumbnail pill, so
// show just the name; the full label is still shown wherever there's room
// for it (LinkAttachmentDialog's Currently Linked pills, search results).
function displayLabel(category: string, label: string): string {
  if (category !== "target") return label;
  const commaIdx = label.indexOf(",");
  return commaIdx > 0 ? label.slice(0, commaIdx).trim() : label;
}

/**
 * Renders one full-width pill per entity a photo is linked to (target name,
 * vehicle rego, location, Unidentified Person placeholder, ...) so a
 * thumbnail shows *who/what* it's linked to at a glance, not just that it
 * is linked. Every pill is the same width regardless of its content,
 * stacked one per line, rather than each shrinking to fit its own text.
 * Renders nothing for an unlinked photo — the amber "not linked"
 * AttachmentLinkBadge covers that case instead.
 *
 * When onClick is given, the whole pill area opens the Link photo to entity
 * panel — this is now the only way to reach it for an already-linked photo,
 * since AttachmentLinkBadge no longer renders its own icon once a photo has
 * links (see AttachmentLinkBadge.tsx).
 */
export function LinkedEntityPills({
  entities,
  onClick,
}: {
  entities?: Array<{ category: string; label: string }>;
  onClick?: () => void;
}) {
  if (!entities || entities.length === 0) return null;
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? "View or edit links" : undefined}
      className={`flex flex-col gap-1 px-1.5 py-1 bg-muted/40 ${onClick ? "cursor-pointer hover:bg-muted/70 transition-colors" : ""}`}
    >
      {entities.map((e, idx) => {
        const Icon = CATEGORY_ICON[e.category] ?? HelpCircle;
        const label = displayLabel(e.category, e.label);
        return (
          <span
            key={`${e.category}-${e.label}-${idx}`}
            title={label}
            className="flex items-center gap-1 w-full px-2 py-0.5 rounded-full bg-emerald-600/90 text-white text-[9px] font-medium"
          >
            <Icon className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
