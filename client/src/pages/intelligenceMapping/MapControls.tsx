import { useEffect, useState } from "react";
import { MARKER_ICON_GROUPS, type MarkerIcon } from "@/lib/markerSvgs";
import {
  TACTICAL_ICONS_BY_GROUP,
  type TacticalGroup,
} from "@/lib/tacticalMarkers";
import { Navigation2 } from "lucide-react";

// Isolated from the main IntelligenceMapping component on purpose: the
// map's heading changes independently of React — a manual twist-to-rotate
// gesture can fire "heading_changed" many times in quick succession — and
// this button's rotating compass arrow is the only thing on the whole page
// that needs to know about it on every tick. When that lived as
// component-level state on IntelligenceMapping itself, every single
// heading tick re-rendered that entire multi-thousand-line page —
// competing with the browser's own map rendering for the same JS main
// thread. Keeping the subscription local here means only this one small
// button re-renders on each tick, not the whole page.
export function NorthUpButton({
  map,
  isMapActuallyVector,
  top = 130,
}: {
  map: google.maps.Map | null;
  isMapActuallyVector: boolean;
  top?: number;
}) {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    if (!map) return;
    setHeading(map.getHeading() ?? 0);
    const listener = map.addListener("heading_changed", () => {
      setHeading(map.getHeading() ?? 0);
    });
    return () => listener.remove();
  }, [map]);

  return (
    <button
      onClick={e => {
        e.stopPropagation();
        if (!map || !isMapActuallyVector) return;
        map.setHeading(0);
      }}
      disabled={!isMapActuallyVector || heading === 0}
      className="absolute z-20 pointer-events-auto flex items-center justify-center bg-white rounded-lg shadow-md border border-gray-200 h-9 w-9 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      style={{ top: `${top}px`, right: "10px" }}
      aria-label="Reset map rotation to North Up"
      title={
        !isMapActuallyVector
          ? "Rotation requires Vector map rendering, which isn't available on this device"
          : heading === 0
            ? "Already North Up"
            : "Reset rotation to North Up"
      }
    >
      <Navigation2
        className="w-4 h-4 text-sky-600 transition-transform"
        style={{ transform: `rotate(${-heading}deg)` }}
      />
    </button>
  );
}

// Rotation slider for the Fly marker card — the same control the flat map's
// marker popup has (preview picture, degrees, 0–359 slider).
export function FlyRotationSlider({
  initial,
  iconUrl,
  onChange,
}: {
  initial: number;
  iconUrl: string;
  onChange: (rotation: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-gray-200 pt-2">
      <img
        src={iconUrl}
        alt=""
        className="h-6 w-6 shrink-0 object-contain transition-transform"
        style={{ transform: `rotate(${value}deg)` }}
      />
      <div className="flex-1">
        <div className="mb-0.5 flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-600">
          <span>Rotation</span>
          <span className="font-semibold normal-case tracking-normal text-gray-700">
            {value}°
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={value}
          onChange={e => {
            const v = Number(e.target.value);
            setValue(v);
            onChange(v);
          }}
          className="w-full cursor-pointer accent-indigo-500"
          aria-label="Marker rotation"
        />
      </div>
    </div>
  );
}

// Flat (no per-group headings) list of every recolourable marker shape, for
// the Place Map Marker picker's Surveillance tab — see the redesign note on
// that picker below. Module-level since it never changes.
export const SURVEILLANCE_ICONS: MarkerIcon[] = MARKER_ICON_GROUPS.flatMap(
  g => g.icons
);

// Renders one TACTICAL_GROUPS entry's tiles inside the shared icon-picker
// grid (both the intel pin "Edit Marker Appearance" dialog and the Place
// Map Marker dialog use this identically) — a divider + small uppercase
// label ahead of its tiles when the picker is on the "All" filter (so
// ~413 icons read as five labelled sections rather than one wall of
// tiles), nothing extra when a single group's own chip is selected since
// the chip label already said which group this is.
export function TacticalIconGroupTiles({
  group,
  visible,
  showHeading,
  selectedKey,
  onSelect,
}: {
  group: { key: TacticalGroup; label: string };
  visible: boolean;
  showHeading: boolean;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  if (!visible) return null;
  const icons = TACTICAL_ICONS_BY_GROUP[group.key];
  if (icons.length === 0) return null;
  return (
    <>
      {showHeading && (
        <p className="col-span-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1.5 mb-0.5 border-t border-border/60 pt-1.5 first:border-t-0 first:pt-0 first:mt-0">
          {group.label}
        </p>
      )}
      {icons.map(t => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          title={t.label}
          className={`aspect-square rounded-lg border-2 flex items-center justify-center transition-all ${
            selectedKey === t.key
              ? "border-primary bg-primary/10"
              : "border-border bg-background hover:border-primary/50"
          }`}
        >
          <img
            src={t.src}
            alt={t.label}
            className="w-[27px] h-[27px] object-contain"
          />
        </button>
      ))}
    </>
  );
}
