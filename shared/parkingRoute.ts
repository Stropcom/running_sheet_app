/**
 * The "[route]" in Target Logger walk sentences.
 *
 * "Walked in" and "Walked away" on a parked vehicle's card write
 * "…walked [route] towards [location]." because the card cannot know how the
 * target went from the vehicle to where he is going. Sometimes the sheet
 * already says: the vehicle's arrival reads "…arrived at the Bar and Grill.
 * Parked in the car park." — then the walk is "through the car park". This
 * fills the placeholder from what the officer has written about that vehicle,
 * at the moment the button is tapped (the live text of the open observation, not
 * only saved rows). Where nothing matches the "[route]" is left exactly as it
 * was for the officer to finish. It only reads the officer's own words about
 * this vehicle; it never guesses.
 *
 * To teach it another place (street/road parking, a driveway), add a row to
 * PARKING_ROUTES and a test — nothing else changes.
 */

export const ROUTE_PLACEHOLDER = "[route]";

interface ParkingRoute {
  /** What the officer wrote about where the vehicle is parked. */
  parked: RegExp;
  /** The words that replace "[route]" ("walked <route> towards …"). */
  route: string;
}

// A name that merely contains the words ("Car Park Road") is not a car park.
const NOT_A_STREET =
  "(?!\\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|way|place|pl|court|ct|crescent|cres|boulevard|blvd|terrace|tce|parade|pde)\\b)";

export const PARKING_ROUTES: readonly ParkingRoute[] = [
  {
    parked: new RegExp(
      `\\b(?:car\\s?parks?|carparks?|parking\\s+(?:lot|bays?)|car\\s+bays?)\\b${NOT_A_STREET}`,
      "i"
    ),
    route: "through the car park",
  },
];

const regoKey = (s: string): string =>
  s.replace(/[^a-z0-9]/gi, "").toUpperCase();

/** Sentences of a text, with the full stop kept. A full stop inside a number
 * or abbreviation ("No. 5", "St.") does not end one: the next word must start
 * a capital or digit after the space, and the part before must not be a lone
 * short abbreviation. */
function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap(para => para.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map(s => s.trim())
    .filter(Boolean);
}

/** The route words for a vehicle, from the officer's text (latest text first
 * wins; within a text, the latest mention of the vehicle). A sentence that
 * names the registration, plus the sentence right after it when that one is
 * about parking ("Parked in the car park."), is the vehicle's parking. */
export function routeForVehicle(
  rego: string,
  texts: readonly (string | null | undefined)[]
): string | null {
  const key = regoKey(rego);
  if (key.length < 2) return null;
  for (let t = texts.length - 1; t >= 0; t--) {
    const list = sentences(texts[t] ?? "");
    for (let i = list.length - 1; i >= 0; i--) {
      if (!regoKey(list[i]).includes(key)) continue;
      const window = [list[i]];
      // "Parked in the car park." follows the arrival sentence.
      for (
        let j = i + 1;
        j < list.length && /^(?:parked|parking)\b/i.test(list[j]);
        j++
      )
        window.push(list[j]);
      const said = window.join(" ");
      for (const p of PARKING_ROUTES) if (p.parked.test(said)) return p.route;
    }
  }
  return null;
}

/** The action text with its first "[route]" filled in for this vehicle, or
 * the text unchanged when the sheet doesn't say. */
export function fillRoute(
  text: string,
  rego: string | undefined,
  texts: readonly (string | null | undefined)[]
): string {
  if (!rego || !text.includes(ROUTE_PLACEHOLDER)) return text;
  const route = routeForVehicle(rego, texts);
  return route ? text.replace(ROUTE_PLACEHOLDER, route) : text;
}
