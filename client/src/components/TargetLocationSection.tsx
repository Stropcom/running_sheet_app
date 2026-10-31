import { Crosshair } from "lucide-react";

/**
 * Map Settings: TARGET LOCATION — one switch, off by default. On: every marker
 * tied to the target of the active running sheet gets a soft see-through tile
 * in its own colour (rules in shared/targetLocation.ts). On or off only.
 */
export function TargetLocationSection({
  on,
  onToggle,
  targetName,
  hasSheet,
}: {
  on: boolean;
  onToggle: () => void;
  /** The target of the active running sheet, when it has one. */
  targetName: string | null;
  hasSheet: boolean;
}) {
  return (
    <div className="px-3 py-3 border-b border-border space-y-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
        Target Location
      </span>
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
          on
            ? "border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20"
            : "border-border bg-card hover:bg-accent/40"
        }`}
        aria-pressed={on}
        data-testid="target-location-switch"
      >
        <Crosshair
          className={`h-3.5 w-3.5 flex-shrink-0 ${
            on ? "text-rose-500" : "text-muted-foreground"
          }`}
        />
        <span
          className={`text-xs font-semibold truncate flex-1 text-left ${
            on ? "text-rose-500" : "text-foreground"
          }`}
        >
          Target location
        </span>
        <span
          className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${
            on ? "text-rose-500" : "text-muted-foreground"
          }`}
        >
          {on ? "On" : "Off"}
        </span>
      </button>
      {on && (
        <p className="text-xs text-muted-foreground">
          {targetName
            ? `Markers linked to ${targetName} are tinted.`
            : hasSheet
              ? "The active running sheet has no target, so nothing is tinted."
              : "Open a running sheet to tint its target's markers."}
        </p>
      )}
    </div>
  );
}
