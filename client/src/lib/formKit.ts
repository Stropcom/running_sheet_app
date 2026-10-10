/**
 * The form kit — one look for forms, dialogs and the titled panels inside
 * them, shared by every screen so they read the same way (the Crash Helper /
 * Access Management pattern: a solid card with a titled header band).
 *
 *  - Controls (Input, Select, Textarea) get a white fill and a visible border
 *    from the base components in components/ui — nothing to do per screen.
 *  - Panels: a white card with a full-strength border and a tinted header
 *    band. The tint is the entity colour the Intelligence chips already use
 *    (person = sky, address = emerald, vehicle = amber, associate = violet,
 *    resident = rose, photo = indigo, other = slate), so colour still tells
 *    you what a panel is without tinting the fields themselves.
 *  - The header band pulls to the card's edges with -mx-3 -mt-3, so a panel
 *    using it must have p-3 padding.
 */

export type FormTone =
  | "person"
  | "address"
  | "vehicle"
  | "associate"
  | "resident"
  | "photo"
  | "neutral";

interface ToneClasses {
  /** The panel (card) itself — add p-3 and any layout classes alongside. */
  panel: string;
  /** The titled header band at the top of the panel. */
  band: string;
}

const BAND =
  "-mx-3 -mt-3 mb-3 flex items-center gap-2 border-b px-3 py-2 text-[13px] font-bold uppercase tracking-wide";

export const FORM_TONES: Record<FormTone, ToneClasses> = {
  person: {
    panel:
      "overflow-hidden rounded-lg border border-sky-500/40 bg-card shadow-sm",
    band: `${BAND} border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300`,
  },
  address: {
    panel:
      "overflow-hidden rounded-lg border border-emerald-500/40 bg-card shadow-sm",
    band: `${BAND} border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300`,
  },
  vehicle: {
    panel:
      "overflow-hidden rounded-lg border border-amber-500/40 bg-card shadow-sm",
    band: `${BAND} border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300`,
  },
  associate: {
    panel:
      "overflow-hidden rounded-lg border border-violet-500/40 bg-card shadow-sm",
    band: `${BAND} border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300`,
  },
  resident: {
    panel:
      "overflow-hidden rounded-lg border border-rose-500/40 bg-card shadow-sm",
    band: `${BAND} border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300`,
  },
  photo: {
    panel:
      "overflow-hidden rounded-lg border border-indigo-500/40 bg-card shadow-sm",
    band: `${BAND} border-indigo-500/30 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300`,
  },
  neutral: {
    panel:
      "overflow-hidden rounded-lg border border-slate-500/40 bg-card shadow-sm",
    band: `${BAND} border-slate-500/30 bg-slate-500/15 text-slate-800 dark:text-slate-300`,
  },
};

/** A panel nested inside another panel: flatter, so depth reads clearly. */
export const FORM_NESTED_PANEL = "rounded-md border border-border bg-muted/40";
/** Title line of a nested panel (no band). */
export const FORM_NESTED_TITLE =
  "mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground/80";

/** Field label: 12px semibold, dark enough to read at a glance. */
export const FORM_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-foreground/80";
/** Helper / hint line under a field. */
export const FORM_HINT = "text-xs text-muted-foreground";
