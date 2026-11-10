import {
  CUE_CATEGORY_LABELS,
  INTEL_CATEGORY_ORDER,
  weekDayBoxes,
  type WeeklyIntelItem,
} from "@shared/sheetIntel";

/** "Actions and items this week" in the Weekly Report: for each item or action
 * the heading, one grey who / what line (the sentence's own wording), Monday to
 * Sunday day boxes (no count — the boxes show which days). */
export function WeeklyIntelActions({ items }: { items: WeeklyIntelItem[] }) {
  if (items.length === 0) return null;
  const groups = INTEL_CATEGORY_ORDER.map(c => ({
    c,
    items: items.filter(i => i.category === c),
  })).filter(g => g.items.length > 0);
  return (
    <div data-testid="wk-actions">
      <p className="mb-1 text-xs uppercase text-foreground/70">
        Actions and items this week
      </p>
      <div className="flex flex-col gap-2">
        {groups.map(g => (
          <div key={g.c} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-foreground/70">
              {CUE_CATEGORY_LABELS[g.c]}
            </p>
            {g.items.map(i => (
              <div
                key={`${i.category}:${i.group}`}
                className="rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold [overflow-wrap:anywhere]">
                    {i.heading}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {i.line}
                </p>
                {(i.also ?? []).length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    Also picked up: {i.also.join(", ")}
                  </p>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span
                    className="inline-flex gap-0.5"
                    aria-label="Days it happened"
                  >
                    {weekDayBoxes(i.dates).map(b => (
                      <span
                        key={b.date}
                        title={b.date}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${
                          b.on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {b.letter}
                      </span>
                    ))}
                  </span>
                  {i.addedByCIN && (
                    <span className="whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold">
                      Added by {i.addedByCIN}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
