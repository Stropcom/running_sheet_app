import { Banknote, Briefcase, Eye, Handshake, Smartphone } from "lucide-react";
import { NewThisShiftGroups } from "@/components/NewThisShiftGroups";
import {
  highlightSegments,
  intelByCategory,
  type CueCategory,
  type SheetIntelLine,
} from "@shared/sheetIntel";

const ICON: Record<CueCategory, typeof Briefcase> = {
  items: Briefcase,
  devices: Smartphone,
  money: Banknote,
  meetings: Handshake,
  behaviour: Eye,
};

export interface SheetIntelReadOnlyData {
  lines: SheetIntelLine[];
  newThisShift: { persons: string[]; vehicles: string[]; locations: string[] };
}

/** The New Intelligence of one running sheet, read only: what the Supervisor
 * Summary's PDF carries — the first-time persons, vehicles and locations and
 * the ticked lines (the supervisor's unticked lines are left out), each the
 * officer's own sentence with the matched words picked out and a straight
 * count where the same item appears more than once on the sheet. */
export function SheetIntelReadOnly({ data }: { data: SheetIntelReadOnlyData }) {
  const lines = data.lines.filter(l => l.included);
  const nw = data.newThisShift;
  const anyNew =
    nw.persons.length + nw.vehicles.length + nw.locations.length > 0;
  if (!anyNew && lines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">None recorded.</p>
    );
  }
  const groups = intelByCategory(lines);
  return (
    <div className="flex flex-col gap-3" data-testid="rollup-intel">
      {anyNew && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
            New this shift — first time recorded
          </p>
          <NewThisShiftGroups data={nw} size="sm" />
        </div>
      )}
      {groups.map(g => {
        const Icon = ICON[g.category];
        return (
          <div
            key={g.category}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {g.label}
              <span className="ml-auto font-semibold tabular-nums text-muted-foreground">
                {g.lines.length}
              </span>
            </div>
            <div className="divide-y divide-border">
              {g.lines.map(l => (
                <div
                  key={l.key}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
                >
                  <span className="pt-0.5 font-mono text-xs text-muted-foreground">
                    {l.time ?? "—"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold [overflow-wrap:anywhere]">
                      {l.heading}
                    </p>
                    <p className="mt-0.5 border-l-2 border-border pl-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {highlightSegments(l.sentence, l.matched).map((s, i) =>
                        s.hit ? (
                          <mark
                            key={i}
                            className="rounded-sm bg-amber-100 px-0.5 text-foreground dark:bg-amber-500/30"
                          >
                            {s.text}
                          </mark>
                        ) : (
                          <span key={i}>{s.text}</span>
                        )
                      )}
                    </p>
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-auto sm:flex-col sm:items-end">
                    {l.doubtful && (
                      <span className="whitespace-nowrap rounded-full border border-amber-600 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                        {l.doubtWord ?? "May have"}
                      </span>
                    )}
                    {l.source === "manual" && (
                      <span className="whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold">
                        Added by {l.addedByCIN}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
