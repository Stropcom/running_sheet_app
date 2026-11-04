import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Border (2px) and padding (5px) either side of a team card; the grid is this
 * much wider than its columns, and the date header starts this far in so its
 * columns line up with the cells. */
export const ROSTER_FRAME_EDGE = 7;
export const ROSTER_FRAME_CHROME = ROSTER_FRAME_EDGE * 2;

/**
 * One team on the roster as its own card: a frame in the team's colour (from
 * User Management → Teams) with a clear gap before the next team. Holds the
 * band, the member rows and the ON DUTY / ON CALL rows.
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
      className="mb-4 rounded-2xl"
      style={{
        border: `2px solid ${colour}`,
        padding: 5,
        background: `color-mix(in srgb, ${colour} 7%, transparent)`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The card's header band, in place of the old grey team label row: the team's
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
