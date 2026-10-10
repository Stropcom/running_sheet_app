import { cn } from "@/lib/utils";
import { SECTION_BAND, SECTION_COUNT, SECTION_TITLE } from "@/lib/pageKit";

/**
 * Titled header band for a profile section card. Must be the FIRST child of a
 * `p-4` card (it bleeds to the card edges with negative margins). Use `sub`
 * for a quieter heading inside a card that already has a band.
 */
export function SectionHeading({
  label,
  count,
  sub,
}: {
  label: string;
  count?: number;
  sub?: boolean;
}) {
  return (
    <div
      className={
        sub
          ? "mb-2 flex items-center gap-2 border-b border-border pb-1.5"
          : SECTION_BAND
      }
    >
      <p
        className={cn(
          sub
            ? "text-xs font-bold uppercase tracking-wide text-foreground/80"
            : SECTION_TITLE
        )}
      >
        {label}
      </p>
      {count !== undefined && <span className={SECTION_COUNT}>{count}</span>}
    </div>
  );
}
