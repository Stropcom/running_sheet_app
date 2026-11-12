/** Perth-anchored (+08:00, no DST) YYYY-MM-DD for "today". */
export function perthTodayISO(): string {
  return toPerthDateISO(new Date());
}

/** YYYY-MM-DD (Perth-anchored) for a JS Date — used to fall back to the
 * running sheet's creation date when a row has no explicit rowDate. */
export function toPerthDateISO(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Add (or subtract) days to a YYYY-MM-DD string, Perth-anchored — same
 * anchoring approach as getRowsBySheetId's day-offset math above.
 *
 * `new Date(dateISO + "T00:00:00+08:00")`'s underlying UTC instant is
 * always 16:00 on the PREVIOUS UTC calendar day (Perth midnight = UTC-8h),
 * so reading .toISOString() straight off it after setUTCDate() reads the
 * UTC day, not the Perth day — silently one day short for every call,
 * including days=0. Re-anchor back to Perth by shifting +8h before slicing,
 * same as toPerthDateISO does. (This was wrong for years — addDaysISO(x, 6)
 * for a Monday-start week produced Saturday instead of Sunday, silently
 * dropping the last day of every week from any range built with it, e.g.
 * the Weekly Activity Report's weekEnd and the Heat Map's last7/last30
 * windows.) */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// A row only marks a genuine sighting of the target at a location if it
// actually narrates presence/activity there — arriving, departing, parking,
// being observed doing something. Officers phrase this many different ways
// ("travelled on X and parked in the vicinity of Y", "reversed from the
// driveway onto X and continued via:", "travelled through the car park and
// continued via:"), so this is deliberately a loose, wide keyword net —
// every verb stem wildcarded to catch arrive/arrived/arriving-style tense
// variants — rather than a small set of exact phrases. False positives (an
// address mentioned in a row that isn't really a visit) are a lesser
// evidentiary risk than false negatives (a real visit silently dropped from
// the count). "continued via" is included even though it reads as a
// departure, not an arrival — an address mentioned in the same row as
// "continued via" is the point they just left, i.e. still part of the same
// visit, not a new one.
//
// The second group below (walk/stood/return/approach/knock/sat, "out of
// sight", and the front door/yard/driveway nouns) covers presence narrated
// without an arrival or departure verb. Officers write what the target is
// *doing*, not only that they got somewhere: "SANDWICH and CAT walked from
// 81 Redmond Road and stood in conversation in the front yard" is as clear a
// sighting at that address as "arrived at", but matched nothing here. The
// effect was perverse — in the same sheet an associate's "CAT arrived at 81
// Redmond Road" was counted while the target standing in the same front yard
// three hours later was not.
export const OBSERVATION_SIGNAL_RE =
  /\b(arriv\w*|depart\w*|left|enter\w*|exit\w*|park\w*|observ\w*|seen|saw|see|met|meet\w*|attend\w*|walk\w*|stood|stand\w*|return\w*|approach\w*|knock\w*|sat|sitting|out\s+of\s+sight|front\s+(?:door|yard|gate)|driveway|pull\w*\s+(?:into|up)|stopp?\w*|wait\w*|remain\w*|stationary|revers\w*\s+from\s+the\s+driveway|continu\w*\s+via|vicinity\s+of|driv(?:e|es|ing|ove)\s+(?:into|through)|travell?\w*\s+through)\b/i;

/** Does this observation narrate a presence at a place, as opposed to merely
 * naming one? Exported for testing — see observationSignal.test.ts. */
export function hasObservationSignal(observation: string): boolean {
  return OBSERVATION_SIGNAL_RE.test(observation);
}

/** Rows that only mark surveillance team activity or a travelled-via street
 * list, not a sighting of the target — same classification the Court
 * Statement generator already uses (server/routers.ts statement.previewData)
 * to exclude these from CIN eligibility, reused here for the same reason:
 * they aren't real observations of the target at a location. */
export function isNonObservationRow(
  observation: string,
  previousObservation: string | null
): boolean {
  const obs = observation.trim();
  if (/^surveillance commenced/i.test(obs) || /^surveillance ceased/i.test(obs))
    return true;
  const endsInWhereat = /whereat[;:]?\s*$/i.test(obs);
  if (
    endsInWhereat &&
    previousObservation &&
    /continued via[;:]/i.test(previousObservation)
  )
    return true;
  return false;
}
