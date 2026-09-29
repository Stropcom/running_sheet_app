import { Target, Car, User, MapPin, HelpCircle, IdCard } from "lucide-react";

const CATEGORY_ICON: Record<string, typeof Target> = {
  target: Target,
  vehicle: Car,
  associate: User,
  location: MapPin,
  unidentified_person: HelpCircle,
  member: IdCard,
};

// Same three categories PERSON_LINK_CATEGORIES (shared/attachmentLinking.ts)
// treats as satisfying the "photo contains a person, needs a person link"
// Governance rule — kept as a separate local copy since this is presentation
// logic (which slot a pill sorts into), not the linking rule itself.
const PERSON_CATEGORIES = new Set([
  "target",
  "associate",
  "unidentified_person",
]);

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

// Sort order within the pill stack: person link(s) always on top, the CIN
// ("member") link always on the bottom, anything else (location/vehicle) in
// between — matches where the "needs person"/"needs CIN" amber placeholders
// below are anchored, so a placeholder always sits in the same slot its
// real green pill would occupy once linked.
function categoryRank(category: string): number {
  if (PERSON_CATEGORIES.has(category)) return 0;
  if (category === "member") return 2;
  return 1;
}

function PillRow({
  Icon,
  label,
  tone,
}: {
  Icon: typeof Target;
  label: string;
  tone: "linked" | "needed";
}) {
  return (
    <span
      title={label}
      className={`flex items-center gap-1 w-full px-2 py-0.5 rounded-full text-white text-[9px] font-medium ${
        tone === "linked" ? "bg-emerald-600/90" : "bg-amber-500/90"
      }`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Renders one full-width pill per entity a photo is linked to (target name,
 * vehicle rego, location, Unidentified Person placeholder, ...) so a
 * thumbnail shows *who/what* it's linked to at a glance, not just that it
 * is linked. Every pill is the same width regardless of its content,
 * stacked one per line, rather than each shrinking to fit its own text.
 *
 * Also renders an amber "not yet linked" placeholder pill for any link this
 * photo still needs but doesn't have — a person link (top slot) when
 * faceCount says a face was detected, a CIN/member link (bottom slot)
 * whenever hasRow says this photo belongs to a running sheet row at all
 * (regardless of how many members are currently on that row — a row with
 * zero members still owes a CIN link just as much as one with several) —
 * so a photo that's short exactly one required link stays visibly flagged
 * in the same place its real pill would go, instead of a separate top-left
 * icon (replaces the old AttachmentLinkBadge). Renders nothing only when
 * there's genuinely nothing to show: no links AND nothing outstanding.
 *
 * When onClick is given, the whole pill area (including any amber
 * placeholder) opens the Link photo to entity panel.
 */
export function LinkedEntityPills({
  entities,
  faceCount,
  hasRow,
  onClick,
}: {
  entities?: Array<{ category: string; label: string }>;
  /** This photo's own detected-face count (row_attachments.faceCount) — a
   * face detected but no person-category link yet shows the "needs person"
   * placeholder. Null/undefined is treated as "unknown, don't flag". */
  faceCount?: number | null;
  /** Does this photo belong to a running sheet row (rowId set)? If so, with
   * no "member" category link yet, shows the "needs CIN" placeholder — a
   * manually-uploaded photo with no row has nothing to attribute a CIN to,
   * so this is skipped for those. */
  hasRow?: boolean;
  onClick?: () => void;
}) {
  const list = entities ?? [];
  const needsPerson =
    (faceCount ?? 0) > 0 && !list.some(e => PERSON_CATEGORIES.has(e.category));
  const needsMember = !!hasRow && !list.some(e => e.category === "member");

  if (list.length === 0 && !needsPerson && !needsMember) return null;

  const sorted = [...list].sort(
    (a, b) => categoryRank(a.category) - categoryRank(b.category)
  );

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? "View or edit links" : undefined}
      className={`flex flex-col gap-1 px-1.5 py-1 bg-muted/40 ${onClick ? "cursor-pointer hover:bg-muted/70 transition-colors" : ""}`}
    >
      {needsPerson && (
        <PillRow Icon={HelpCircle} label="Needs person link" tone="needed" />
      )}
      {sorted.map((e, idx) => (
        <PillRow
          key={`${e.category}-${e.label}-${idx}`}
          Icon={CATEGORY_ICON[e.category] ?? HelpCircle}
          label={displayLabel(e.category, e.label)}
          tone="linked"
        />
      ))}
      {needsMember && (
        <PillRow Icon={IdCard} label="Needs CIN link" tone="needed" />
      )}
    </div>
  );
}
