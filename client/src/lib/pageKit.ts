/**
 * The page kit — the look of read-only content pages and the cards on them,
 * matching the form kit (lib/formKit.ts) and the Crash Helper / Access
 * Management pattern: solid white cards with a full-strength border, a
 * titled header band, a count pill, and rows you can tell apart.
 *
 *  - SECTION_CARD is the card (has p-4); SECTION_BAND / SECTION_TITLE /
 *    SECTION_COUNT make its titled header band, which pulls to the card's
 *    edges with -mx-4 -mt-4.
 *  - ROW_ITEM is a row inside a card.
 *  - FIELD_LABEL over FIELD_VALUE is how a label/value pair reads.
 *  - Nothing in the kit is smaller than 12px (text-xs).
 */

export const SECTION_CARD =
  "overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm";
export const SECTION_BAND =
  "-mx-4 -mt-4 mb-3 flex items-center gap-2 border-b border-border bg-muted/70 px-4 py-2.5";
export const SECTION_TITLE =
  "text-[13px] font-bold uppercase tracking-wide text-foreground";
export const SECTION_COUNT =
  "rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground";

export const ROW_ITEM = "rounded-lg border border-border bg-background";

export const FIELD_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-foreground/70";
export const FIELD_VALUE = "text-sm text-foreground";
