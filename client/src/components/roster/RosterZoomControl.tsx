import { Minus, Plus, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRosterZoom } from "@/lib/rosterZoomPref";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  clampZoom,
  stepZoom,
} from "@shared/rosterZoom";

/**
 * Zoom for the Team Duty Roster: − and + buttons and a slider from 100% (the
 * grid as it always was, the default) down to 25%, plus "Fit all teams", which
 * picks the zoom that shows every team on the screen. Ctrl + scroll and a
 * two-finger pinch on the grid zoom too (RosterPage).
 */
export function RosterZoomControl({ onFit }: { onFit: () => void }) {
  const [zoom, onZoom] = useRosterZoom();
  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Roster zoom"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => onZoom(stepZoom(zoom, -1))}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <input
        type="range"
        aria-label="Zoom level"
        min={Math.round(MIN_ZOOM * 100)}
        max={Math.round(MAX_ZOOM * 100)}
        step={Math.round(ZOOM_STEP * 100)}
        value={Math.round(zoom * 100)}
        onChange={e => onZoom(clampZoom(Number(e.target.value) / 100))}
        className="h-2 w-24 cursor-pointer accent-primary sm:w-32"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => onZoom(stepZoom(zoom, 1))}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <span
        className="w-10 text-right text-xs font-bold tabular-nums"
        aria-live="polite"
      >
        {Math.round(zoom * 100)}%
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1"
        onClick={onFit}
        title="Zoom out just far enough to see every team"
      >
        <ScanSearch className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Fit all teams</span>
        <span className="sm:hidden">Fit</span>
      </Button>
    </div>
  );
}

/**
 * The slider along the bottom of the roster that scrolls through the dates.
 * It is its own component so it can follow the zoom (the zoomed grid is
 * shorter or longer to scroll) without the whole roster re-rendering.
 */
export function RosterScrubber({
  scrollLeft,
  baseWidth,
  onScrub,
}: {
  scrollLeft: number;
  /** The scrollable width of the grid at 100% (the dates, not the name column). */
  baseWidth: number;
  onScrub: (value: number) => void;
}) {
  const [zoom] = useRosterZoom();
  return (
    <input
      type="range"
      aria-label="Scroll through the dates"
      min={0}
      max={Math.max(1, Math.round(baseWidth * zoom))}
      value={scrollLeft}
      onChange={e => onScrub(Number(e.target.value))}
      className="w-full h-2 accent-primary cursor-pointer"
      style={{ appearance: "auto" }}
    />
  );
}
