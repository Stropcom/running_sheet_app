import { Target, Car, User, MapPin, HelpCircle } from "lucide-react";

const CATEGORY_ICON: Record<string, typeof Target> = {
  target: Target,
  vehicle: Car,
  associate: User,
  location: MapPin,
  unidentified_person: HelpCircle,
};

/**
 * Renders one small pill per entity a photo is linked to (target name,
 * vehicle rego, location, Unidentified Person placeholder, ...) so a
 * thumbnail shows *who/what* it's linked to at a glance, not just that it
 * is linked (see AttachmentLinkBadge for the latter). Renders nothing for
 * an unlinked photo — the amber "not linked" badge already covers that.
 */
export function LinkedEntityPills({
  entities,
}: {
  entities?: Array<{ category: string; label: string }>;
}) {
  if (!entities || entities.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-1.5 py-1 bg-muted/40">
      {entities.map((e, idx) => {
        const Icon = CATEGORY_ICON[e.category] ?? HelpCircle;
        return (
          <span
            key={`${e.category}-${e.label}-${idx}`}
            title={e.label}
            className="flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-emerald-600/90 text-white text-[9px] font-medium max-w-full"
          >
            <Icon className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{e.label}</span>
          </span>
        );
      })}
    </div>
  );
}
