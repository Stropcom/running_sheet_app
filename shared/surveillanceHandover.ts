/**
 * One team ceases and the next takes over — on a separate running sheet, for
 * the same target. The second sheet's Target Logger continues from where the
 * first left off when EVERYTHING matches:
 *   - the same operation;
 *   - the same target;
 *   - the same location (the place the second sheet commences at is where the
 *     first sheet ceased, or where the target was last logged);
 *   - the same time: the second sheet commenced at the minute the first ceased,
 *     or within one minute either side of it.
 * Nothing else carries over, and nothing is asked of the officers. These are
 * the pure parts of that rule (the sheet lookup is `findHandoverSource`,
 * `server/db.ts`). Deterministic: only row text and times.
 */

/** The place a "Surveillance commenced / ceased …" row names: the text after
 * the phrase, minus a leading "at" / "in the vicinity of" / "near" / "on",
 * up to the end of the sentence. Null when the row names no place. */
export function surveillancePlace(
  observation: string | null,
  phrase: "commenced" | "ceased"
): string | null {
  if (!observation) return null;
  const re = new RegExp(
    `(?:^|\\n)[ \\t]*surveillance[ \\t]+${phrase}\\b[ \\t]*([^\\n]*)`,
    "gi"
  );
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(observation)) !== null) last = m[1];
  if (last == null) return null;
  const rest = last
    .replace(
      /^[ \t,:-]*(?:(?:at|in the vicinity of|in the area of|near|on|outside)\b[ \t]*)?/i,
      ""
    )
    // up to the end of the sentence (a full stop followed by space or the end)
    .replace(/\.(?:\s.*)?$/, "")
    .trim();
  return rest.length >= 3 ? rest : null;
}

/** How many minutes apart two times may be for a hand-over. */
export const HANDOVER_MINUTES = 1;

export interface HandoverFacts {
  /** The first sheet: when it ended (minutes since a fixed origin) and the
   * places it ended at — the ceased rows' places and where he was last logged. */
  endedAtMinutes: number | null;
  endedPlaces: string[];
  /** The second sheet's first "Surveillance commenced" row. */
  commencedAtMinutes: number | null;
  commencedPlace: string | null;
}

/** Whether the second sheet's commencement is a continuation of the first:
 * the same minute or one either side, and the same place. */
export function isHandover(
  f: HandoverFacts,
  samePlace: (a: string, b: string) => boolean
): boolean {
  if (
    f.endedAtMinutes == null ||
    f.commencedAtMinutes == null ||
    !f.commencedPlace
  )
    return false;
  if (Math.abs(f.commencedAtMinutes - f.endedAtMinutes) > HANDOVER_MINUTES)
    return false;
  return f.endedPlaces.some(p => p && samePlace(p, f.commencedPlace as string));
}
