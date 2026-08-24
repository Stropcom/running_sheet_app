// SMEAC — the standard briefing structure: Situation, Mission, Execution,
// Administration & Logistics, Command & Signal. The letter is a fixed
// reference point regardless of what this particular section is titled.
// Shared between SmeacBriefingForm (editing) and SmeacMapOverlay (reading)
// so both present the same section structure.
export function SmeacLabel({
  letter,
  label,
  icon: Icon,
}: {
  letter: string;
  label: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-5 w-5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-bold flex items-center justify-center shrink-0">
        {letter}
      </span>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </h3>
    </div>
  );
}
