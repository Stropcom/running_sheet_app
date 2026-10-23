import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SECTION_CARD, SECTION_TITLE } from "@/lib/pageKit";

/** Completion colour for a percentage (done / part way / not started). */
export function percentTextClass(percent: number) {
  return percent === 100
    ? "text-emerald-700 dark:text-emerald-400"
    : percent >= 50
      ? "text-sky-700 dark:text-sky-400"
      : "text-rose-700 dark:text-rose-400";
}

/**
 * A titled section of the sheet Governance page, in the same look as the
 * Certify page's operation cards: a solid white card with a grey titled band
 * (the whole band opens and closes it) and the checks as rows inside.
 */
export function GovernanceSection({
  title,
  subtitle,
  percent,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  percent: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`${SECTION_CARD} mb-3 !p-0`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 bg-muted/70 px-4 py-2.5 text-left transition-colors hover:bg-muted ${
          open ? "border-b border-border" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className={SECTION_TITLE}>{title}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-foreground/70">{subtitle}</p>
          )}
        </div>
        <span className={`text-xs font-bold ${percentTextClass(percent)}`}>
          {percent}%
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="flex flex-col gap-2 p-3">{children}</div>}
    </section>
  );
}
