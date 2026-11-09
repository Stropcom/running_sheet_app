export interface NewThisShift {
  persons: string[];
  vehicles: string[];
  locations: string[];
}

const GROUPS: Array<{
  key: keyof NewThisShift;
  label: string;
  chip: string;
}> = [
  {
    key: "persons",
    label: "Persons",
    chip: "border-blue-900 bg-blue-900/10 text-blue-900 dark:border-blue-300 dark:text-blue-200",
  },
  {
    key: "vehicles",
    label: "Vehicles",
    chip: "border-amber-600 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  },
  {
    key: "locations",
    label: "Locations",
    chip: "border-emerald-600 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  },
];

/** "New this shift — first time recorded", grouped under Persons, Vehicles and
 * Locations (a group with nothing in it is not shown). */
export function NewThisShiftGroups({
  data,
  size = "md",
}: {
  data: NewThisShift;
  size?: "sm" | "md";
}) {
  const text = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";
  return (
    <div className="flex flex-col gap-2.5" data-testid="intel-new">
      {GROUPS.filter(g => data[g.key].length > 0).map(g => (
        <div key={g.key} className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
            {g.label}
            <span className="rounded-full border border-border bg-background px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
              {data[g.key].length}
            </span>
          </p>
          <div
            className="flex flex-wrap gap-1.5"
            data-testid={`intel-new-${g.key}`}
          >
            {data[g.key].map(label => (
              <span
                key={label}
                className={`rounded-md border font-semibold [overflow-wrap:anywhere] ${text} ${g.chip}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
