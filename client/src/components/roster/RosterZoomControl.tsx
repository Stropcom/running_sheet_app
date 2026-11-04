import { Minus, Plus, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
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
export function RosterZoomControl({
  zoom,
  onZoom,
  onFit,
}: {
  zoom: number;
  onZoom: (z: number) => void;
  onFit: () => void;
}) {
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
