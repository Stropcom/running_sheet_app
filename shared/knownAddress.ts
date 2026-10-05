// Pure helpers behind the running-sheet address suggestions: matching what an
// officer has typed ("13 Den") against an Intelligence address entity's
// short-form ("13 Denford Street, KENWICK"), and writing the chosen address
// back out in the sheet's own convention. Shared so the server (search) and
// client (insert) cannot drift apart, and so it can be unit tested.

const STREET_START_RE = /^\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+\S/;

export interface KnownAddressParts {
  /** Business/place name when the short-form leads with one, else "". */
  businessName: string;
  /** "13 Denford Street" — number + street. */
  street: string;
  /** "KENWICK", or "" when the short-form carries no suburb. */
  suburb: string;
}

/** Splits an Intelligence address short-form into business / street /
 * suburb. Returns null when there is no street (number-led) segment — a
 * business known only by name can't be matched by a typed street number. */
export function parseKnownAddress(shortForm: string): KnownAddressParts | null {
  const segs = shortForm
    .replace(/\s*\([^)]{1,80}\)\s*$/, "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const streetIdx = segs.findIndex(s => STREET_START_RE.test(s));
  if (streetIdx < 0) return null;
  const businessName = segs.slice(0, streetIdx).join(", ");
  const suburb = segs
    .slice(streetIdx + 1)
    .join(", ")
    .replace(/\s+(?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i, "")
    .trim();
  return { businessName, street: segs[streetIdx], suburb };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** True when what's been typed so far is the start of this address's street
 * ("13 den" → "13 Denford Street"). */
export function knownAddressMatches(typed: string, shortForm: string): boolean {
  const q = norm(typed);
  if (!q) return false;
  const parts = parseKnownAddress(shortForm);
  return !!parts && norm(parts.street).startsWith(q);
}

/** True when what's been typed after "@" appears anywhere in this known
 * place — its business name, street or suburb ("kenw" → "Bunnings, …,
 * KENWICK"). Only places with a street can be written out in full. */
export function knownPlaceMatches(typed: string, shortForm: string): boolean {
  const q = norm(typed);
  if (!q || !parseKnownAddress(shortForm)) return false;
  return norm(shortForm).includes(q);
}

/** The text written into the observation for a chosen known address, in the
 * sheet convention "13 Denford Street, KENWICK WA (13 Denford Street)" —
 * or "Blend Cafe, 1 Smith Street, MELVILLE WA (Blend Cafe)" for a business.
 * Always the full form, even when the bracket was already introduced earlier
 * on the sheet: the officer picked a specific address, so write all of it. */
export function buildSheetAddressText(
  parts: KnownAddressParts,
  state = "WA"
): string {
  const label = parts.businessName || parts.street;
  if (!parts.suburb) return parts.street;
  const lead = parts.businessName ? `${parts.businessName}, ` : "";
  return `${lead}${parts.street}, ${parts.suburb.toUpperCase()} ${state} (${label})`;
}
