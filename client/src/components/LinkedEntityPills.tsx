import {
  Target,
  Car,
  User,
  MapPin,
  HelpCircle,
  IdCard,
  FolderSearch,
} from "lucide-react";
import { Link } from "wouter";

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

// A target/associate's composed name always ends "... (SURNAME)" — see
// composeTargetName in lib/addressFormat.ts, which is what entityLabel is
// set from at link time. Pulling it back out here means the Profile pill
// doesn't need a second field just for display, and naturally has nothing
// to show for a business-name-only associate (no parenthetical), where a
// surname wouldn't mean anything anyway.
function extractSurname(label: string): string | null {
  const m = label.match(/\(([^()]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

// Purple "Profile SURNAME" pill — links straight to that person's
// Intelligence page profile. Deliberately a separate colour from the green
// linked pills above it (this is navigation, not link status) and only
// rendered for target/associate categories, which are the only two with an
// actual Intelligence profile page (vehicle/location/unidentified_person
// aren't "a person's profile"). A target links by id (the only category
// with a real foreign key — see attachLinkedCounts in server/db.ts); an
// associate has no id here, so it links by its exact name text instead,
// same as every other associate-profile link in the app.
function ProfilePillRow({
  category,
  label,
  targetId,
}: {
  category: string;
  label: string;
  targetId: number | null;
}) {
  const surname = extractSurname(label);
  if (!surname) return null;
  const href =
    category === "target"
      ? targetId != null
        ? `/intelligence/target/${targetId}`
        : null
      : category === "associate"
        ? `/intelligence/associate/${encodeURIComponent(label)}`
        : null;
  if (!href) return null;
  return (
    <Link
      href={href}
      onClick={e => e.stopPropagation()}
      title={`Open ${surname}'s Intelligence profile`}
      className="flex items-center gap-1 w-full px-2 py-0.5 rounded-full text-white text-[9px] font-medium bg-violet-600/90 hover:bg-violet-600 transition-colors"
    >
      <FolderSearch className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">Profile {surname}</span>
    </Link>
  );
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
 * icon (replaces the old AttachmentLinkBadge). With no links and nothing
 * outstanding, renders nothing for a read-only caller (no onClick given —
 * e.g. the Weekly Activity report) but an explicit "Not linked" placeholder
 * for an editable one, so a fully-unlinked manually-uploaded photo — no
 * face detected, no row to owe a CIN link — still has something to click;
 * returning nothing there left no way back into the link editor at all.
 *
 * When onClick is given, the whole pill area (including any amber
 * placeholder) opens the Link photo to entity panel.
 */
export function LinkedEntityPills({
  entities,
  faceCount,
  hasRow,
  onClick,
  showProfileLinks,
}: {
  entities?: Array<{
    category: string;
    label: string;
    targetId?: number | null;
  }>;
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
  /** Adds a purple "Profile SURNAME" pill below everything else, per linked
   * target/associate, that navigates to their Intelligence page profile —
   * only the Images folder wants this (see ImagesPage.tsx); every other
   * caller of this component omits it. */
  showProfileLinks?: boolean;
}) {
  const list = entities ?? [];
  const needsPerson =
    (faceCount ?? 0) > 0 && !list.some(e => PERSON_CATEGORIES.has(e.category));
  const needsMember = !!hasRow && !list.some(e => e.category === "member");

  // Nothing linked, nothing outstanding (no face detected, no row to owe a
  // CIN link) — a manually-uploaded photo lands here exactly when it was
  // never linked to anything at upload. Previously this returned null
  // outright, which left the photo with no pill at all — and therefore no
  // click target, since the whole point of onClick here is "click a pill to
  // open the link editor". A photo could end up permanently unlinkable with
  // no way back in. When the caller supports editing (onClick given), show
  // an explicit "not linked" placeholder instead so there's always
  // something to click; read-only callers (no onClick, e.g. the Weekly
  // Activity report) still render nothing, same as before.
  if (list.length === 0 && !needsPerson && !needsMember) {
    if (!onClick) return null;
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        title="Link this photo to an entity"
        className="flex flex-col gap-1 px-1.5 py-1 bg-muted/40 cursor-pointer hover:bg-muted/70 transition-colors"
      >
        <PillRow
          Icon={HelpCircle}
          label="Not linked — tap to link"
          tone="needed"
        />
      </div>
    );
  }

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
      {showProfileLinks &&
        sorted
          .filter(e => e.category === "target" || e.category === "associate")
          .map((e, idx) => (
            <ProfilePillRow
              key={`profile-${e.category}-${e.label}-${idx}`}
              category={e.category}
              label={e.label}
              targetId={e.targetId ?? null}
            />
          ))}
    </div>
  );
}
