// Filling in the suburb of a bare address from an earlier row of the sheet.
//
// "returned to 4 Glyde Street" can borrow its suburb from an earlier row that
// wrote "4 Glyde Street, MAYLANDS (4 Glyde Street)". But a street name is not
// a place: if the sheet names the same number and street in TWO different
// suburbs, a bare mention could be either, and giving it whichever came first
// puts the visit in a suburb nobody wrote. So the suburb is only filled in when
// the sheet knows exactly one.

/** The suburb part of a written address: what follows the first comma, with a
 * trailing state code removed ("4 Glyde Street, MAYLANDS WA" → "MAYLANDS"). */
export function suburbOf(full: string): string {
  const after = full.split(",").slice(1).join(",");
  return after
    .replace(/\b(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b.*$/i, "")
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Every full address seen for each street-number-and-name key. */
export type KnownAddresses = Map<string, string[]>;

export function noteKnownAddress(
  known: KnownAddresses,
  key: string,
  full: string
): void {
  if (!key) return;
  const list = known.get(key) ?? [];
  if (!list.includes(full)) list.push(full);
  known.set(key, list);
}

/**
 * The full address to use for a bare mention of `key`, or undefined when the
 * sheet doesn't pin it down (two different suburbs seen). Seen only without a
 * suburb, or in one suburb, the best (with-suburb) form is used.
 */
export function resolveKnownAddress(
  known: KnownAddresses,
  key: string
): string | undefined {
  const list = known.get(key);
  if (!list || list.length === 0) return undefined;
  const suburbs = new Set(list.map(suburbOf).filter(Boolean));
  if (suburbs.size > 1) return undefined;
  return list.find(a => suburbOf(a)) ?? list[0];
}
