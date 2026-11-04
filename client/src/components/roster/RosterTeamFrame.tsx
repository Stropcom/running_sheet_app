import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** The team's border and the colour spine down its left edge. The grid is wider
 * than its columns by the left edge plus the right border, and the date header
 * starts the left edge in so its columns line up with the cells. */
const FRAME_BORDER = 3;
const SPINE_WIDTH = 7;
export const ROSTER_FRAME_EDGE = FRAME_BORDER + SPINE_WIDTH;
export const ROSTER_FRAME_CHROME = ROSTER_FRAME_EDGE + FRAME_BORDER;

/**
 * One team on the roster as its own section: a heavy line in the team's colour
 * (from User Management → Teams) around it with rounded corners like the other
 * sections of the app, a light tint behind its
 * rows, and a colour spine down the left edge that stays on screen while the
 * dates scroll, so you can always see which team you are in and where it ends.
 * Holds the band, the member rows and the ON DUTY / ON CALL rows.
 */
export function RosterTeamFrame({
  colour,
  children,
}: {
  colour: string;
  children: ReactNode;
}) {
  return (
    <div
      className="mb-5 flex rounded-xl"
      style={{
        border: `${FRAME_BORDER}px solid ${colour}`,
        background: `color-mix(in srgb, ${colour} 9%, transparent)`,
        // Clips the spine and the band to the rounded corners; unlike
        // overflow: hidden it keeps the spine and name column sticky.
        overflow: "clip",
      }}
    >
      {/* The spine: sticky to the left edge, full height of the team, above the
          name cells (which also stick there). */}
      <div
        aria-hidden
        className="flex-none"
        style={{
          position: "sticky",
          left: 0,
          zIndex: 25,
          width: SPINE_WIDTH,
          background: colour,
        }}
      />
      <div className="min-w-0 flex-1 pt-[3px]">{children}</div>
    </div>
  );
}

/**
 * The team's header band, in place of the old grey team label row: the team's
 * name and member count on a tint of its colour, with an arrow to fold the
 * team down to its ON DUTY / ON CALL totals. The name part stays at the left
 * edge while the dates scroll.
 */
export function RosterTeamBand({
  colour,
  name,
  memberCount,
  collapsed,
  onToggle,
  nameColWidth,
  highlight = false,
}: {
  colour: string;
  name: string;
  memberCount: number;
  collapsed: boolean;
  onToggle: () => void;
  nameColWidth: number;
  /** A member is being dragged over this team. */
  highlight?: boolean;
}) {
  const band = `color-mix(in srgb, ${colour} ${highlight ? 45 : 24}%, var(--color-card))`;
  const ink = `color-mix(in srgb, ${colour} 62%, var(--color-foreground))`;
  return (
    <div
      className="mb-[3px] flex h-8 items-center rounded-lg"
      style={{ background: band }}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
        onClick={onToggle}
        onPointerDown={e => e.stopPropagation()}
        className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg pl-2 pr-2 text-left text-[11px] font-extrabold uppercase tracking-wider"
        style={{
          width: nameColWidth,
          position: "sticky",
          left: 0,
          zIndex: 20,
          background: band,
          color: ink,
        }}
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 flex-shrink-0 transition-transform",
            collapsed && "-rotate-90"
          )}
        />
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[10px] font-semibold normal-case tracking-normal opacity-80">
          {memberCount}
        </span>
      </button>
    </div>
  );
}
