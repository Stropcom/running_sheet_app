/**
 * Has the surveillance ended? Individual officers cease and commence during a
 * deployment, so one person's "Surveillance ceased" must not end it: the Target
 * Logger and the target flag stop being live only once EVERY member of the
 * team has ceased.
 *
 * Each CIN on the sheet (its team roster, plus anyone who appears on a row) is
 * either on or off. A CIN starts on. A row that starts "Surveillance ceased"
 * puts every CIN on that row off; a row that starts "Surveillance commenced"
 * puts every CIN on it back on. Ordinary rows change nothing — a CIN that has
 * ceased stays ceased until it commences again — so a late debrief row can't
 * bring the logger back to life. It ends the moment the last CIN goes off, and
 * restarts the moment any CIN commences. Nobody is ignored: a team member who
 * never writes a row still has to cease. Deterministic: only the rows, in
 * order.
 */

import { surveillancePlace } from "./surveillanceHandover";

export interface SurveillanceRow {
  id: number;
  observation: string | null;
  /** The time written on the row, e.g. "03:40 PM". */
  time?: string | null;
  /** The CINs on the row. */
  members: string[];
}

export interface SurveillanceState {
  /** Everyone has ceased and nobody has commenced since. */
  ended: boolean;
  /** The row whose ceased finished it (set only when `ended`). */
  endedByRowId: number | null;
  /** That row's time (set only when `ended`). */
  endedAtTime: string | null;
  /** CINs that are still on. */
  stillOn: string[];
  /** The "Surveillance commenced" row that started the live stretch — the
   * first commenced, or the first after everyone had ceased. Null when no row
   * says commenced, or the surveillance has ended. */
  commencedByRowId: number | null;
  /** That row's time, e.g. "08:39 AM". */
  commencedAtTime: string | null;
  /** The place that row names ("Dental Boutique Perth, 634 Murray Street … (Dental Boutique Perth)"), as written. */
  commencedPlace: string | null;
}

type Signal = "ceased" | "commenced" | null;

/** The surveillance signal a row gives: its last "Surveillance ceased" /
 * "Surveillance commenced" at the start of the row or of a line. */
export function surveillanceSignal(observation: string | null): Signal {
  if (!observation) return null;
  const re = /(?:^|\n)[ \t]*surveillance[ \t]+(ceased|commenced)\b/gi;
  let last: Signal = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(observation)) !== null)
    last = m[1].toLowerCase() as Signal;
  return last;
}

const norm = (cin: string) => cin.trim().toUpperCase();

export function surveillanceState(
  rows: SurveillanceRow[],
  roster: string[]
): SurveillanceState {
  const on = new Map<string, boolean>();
  for (const c of roster) if (norm(c)) on.set(norm(c), true);
  for (const r of rows)
    for (const c of r.members)
      if (norm(c)) on.set(norm(c), on.get(norm(c)) ?? true);
  let ended = false;
  let endedByRowId: number | null = null;
  let endedAtTime: string | null = null;
  const allOff = () => on.size > 0 && Array.from(on.values()).every(v => !v);
  let commencedRow: SurveillanceRow | null = null;
  for (const r of rows) {
    const signal = surveillanceSignal(r.observation);
    if (!signal) continue;
    // The live stretch starts at the first commenced, or the first one after
    // everyone had ceased; later commenced rows (another officer joining) are
    // not a new start.
    if (signal === "commenced" && (ended || !commencedRow)) commencedRow = r;
    for (const c of r.members) {
      if (norm(c)) on.set(norm(c), signal === "commenced");
    }
    const now = allOff();
    if (now && !ended) {
      endedByRowId = r.id;
      endedAtTime = r.time ?? null;
    }
    if (!now) {
      endedByRowId = null;
      endedAtTime = null;
    }
    ended = now;
    if (ended) commencedRow = null;
  }
  return {
    ended,
    endedByRowId: ended ? endedByRowId : null,
    endedAtTime: ended ? endedAtTime : null,
    stillOn: Array.from(on.entries())
      .filter(([, v]) => v)
      .map(([k]) => k),
    commencedByRowId: commencedRow ? commencedRow.id : null,
    commencedAtTime: commencedRow ? (commencedRow.time ?? null) : null,
    commencedPlace: commencedRow
      ? surveillancePlace(commencedRow.observation, "commenced")
      : null,
  };
}
