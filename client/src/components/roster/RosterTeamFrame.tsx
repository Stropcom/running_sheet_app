import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sizes here are in SCREEN pixels, whatever the roster's zoom. The grid is
 * zoomed with CSS `zoom`, which shrinks everything including the card corners,
 * so at 70% the rounding was barely visible. `--rpx` is one screen pixel in
 * the zoomed grid (RosterPage sets it to 1/zoom), so `22 * var(--rpx)` is
 * always 22 pixels on screen.
 */
const px = (n: number) => `calc(${n} * var(--rpx, 1px))`;
const CORNER = 22; // the rounded corners and the width of the colour end
/** The colour end down the left of a team; the date header starts this far in
 * so its columns line up with the cells. */
export const ROSTER_FRAME_EDGE = px(CORNER);
/** Width of the grid beyond its columns at 100% (the colour end and the right
 * padding); only a minimum, the grid is as wide as its rows. */
export const ROSTER_FRAME_CHROME = CORNER + 6;

/**
 * One team on the roster as its own soft card: a rounded card tinted with the
 * team's colour (from User Management → Teams) with a fine outline, a wide
 * colour end at its left that stays on screen with its rounded corners while
 * the dates scroll (so the card always shows where it begins), then the header
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
      className="mb-5 flex"
      style={{
        borderRadius: px(CORNER),
        // Opaque, so the dates sliding under the name column are hidden.
        background: `color-mix(in srgb, ${colour} 14%, var(--color-background))`,
        boxShadow: `0 0 0 ${px(2)} color-mix(in srgb, ${colour} 55%, transparent)`,
      }}
    >
      <div
        aria-hidden
        className="flex-none"
        style={{
          position: "sticky",
          left: 0,
          zIndex: 25,
          width: px(CORNER),
          background: colour,
          borderRadius: `${px(CORNER)} 0 0 ${px(CORNER)}`,
        }}
      />
      <div className="min-w-0 flex-1" style={{ padding: "4px 6px 6px 0" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * The card's header: the team's name and member count in its colour, with an
 * arrow that folds the team down to its ON DUTY / ON CALL totals. The name part
 * stays at the left while the dates scroll.
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
  const ink = `color-mix(in srgb, ${colour} 70%, var(--color-foreground))`;
  return (
    <div
      className="mb-[3px] flex h-8 items-center rounded-lg"
      style={{
        background: highlight
          ? `color-mix(in srgb, ${colour} 35%, transparent)`
          : "transparent",
      }}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
        onClick={onToggle}
        onPointerDown={e => e.stopPropagation()}
        className="flex h-8 flex-shrink-0 items-center gap-1.5 pl-2 pr-2 text-left text-[11px] font-extrabold uppercase tracking-wider"
        style={{
          width: nameColWidth,
          position: "sticky",
          left: ROSTER_FRAME_EDGE,
          zIndex: 20,
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
