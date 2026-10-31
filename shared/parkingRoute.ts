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
  parked: readonly RegExp[];
  /** The words for "[route]" in "…walked [route], entered <place> and continued
   * out of sight." (Walked in); empty drops the whole "walked [route]," part
   * ("exited the vehicle, entered <place> …"). */
  walkIn: string;
  /** The words for "[route]" in "…walked [route] towards [location]." (Walked
   * away); empty leaves "walked towards [location]". */
  walkAway: string;
}

// A name that merely contains the words ("Car Park Road") is not a car park.
const NOT_A_STREET =
  "(?!\\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|way|place|pl|court|ct|crescent|cres|boulevard|blvd|terrace|tce|parade|pde)\\b)";

const STREET_TYPES =
  "(?:Street|Road|Avenue|Drive|Lane|Place|Court|Crescent|Terrace|Parade|Way|Boulevard|Highway|Close)";

export const PARKING_ROUTES: readonly ParkingRoute[] = [
  {
    parked: [
      new RegExp(
        `\\b(?:car\\s?parks?|carparks?|parking\\s+(?:lot|bays?)|car\\s+bays?)\\b${NOT_A_STREET}`,
        "i"
      ),
    ],
    walkIn: "through the car park",
    walkAway: "through the car park",
  },
  {
    // Parked on the street / road / kerb, or on a named street.
    parked: [
      new RegExp(
        "\\bparked\\b[^.]*?\\b(?:on|along)\\s+(?:the\\s+)?(?:street|road|kerb|curb|verge)\\b",
        "i"
      ),
      // A named street: the name starts with capitals ("Smith Street"), so
      // "the drive way" is not one.
      new RegExp(
        `\\b[Pp]arked\\s+(?:[Oo]n|[Aa]long)\\s+(?:[A-Z][\\w'-]*\\s+){1,3}${STREET_TYPES}\\b`
      ),
    ],
    walkIn: "to",
    walkAway: "",
  },
  {
    // Parked in the driveway: the walk from the vehicle isn't worth a sentence.
    parked: [new RegExp(`\\b(?:driveway|drive\\s+way)\\b${NOT_A_STREET}`, "i")],
    walkIn: "",
    walkAway: "",
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

/** Where the vehicle was last parked, from the officer's text. The vehicle's
 * latest arrival or parking statement decides — a sentence naming the
 * registration that says it arrived or parked, plus any sentence right after it
 * that begins "Parked" — and nothing older is looked at (an earlier visit's car
 * park must not leak into a later arrival on the street). Later text is read
 * first, and the box being typed in comes last. A mention that is only a walk to
 * or from the vehicle says nothing about where it is parked and is skipped.
 * Null when that statement fits no known place, or fits two (it would be a
 * guess). */
export function parkingForVehicle(
  rego: string,
  texts: readonly (string | null | undefined)[]
): ParkingRoute | null {
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
      if (!/\b(?:arrived|parked|parking)\b/i.test(said)) continue;
      const hits = PARKING_ROUTES.filter(p =>
        p.parked.some(re => re.test(said))
      );
      return hits.length === 1 ? hits[0] : null;
    }
  }
  return null;
}

/** The action text with its first "[route]" filled in for this vehicle, or
 * the text unchanged when the sheet doesn't say. Walked in ("walked [route],
 * entered …") and Walked away ("walked [route] towards …") read differently. */
export function fillRoute(
  text: string,
  rego: string | undefined,
  texts: readonly (string | null | undefined)[]
): string {
  if (!rego || !text.includes(ROUTE_PLACEHOLDER)) return text;
  const parking = parkingForVehicle(rego, texts);
  if (!parking) return text;
  const walkingIn = text.includes(`${ROUTE_PLACEHOLDER},`);
  const route = walkingIn ? parking.walkIn : parking.walkAway;
  if (route) return text.replace(ROUTE_PLACEHOLDER, route);
  // Nothing to say: Walked in loses "walked [route], " ("exited the vehicle,
  // entered …"); Walked away's "walked [route] towards" reads "walked towards".
  return walkingIn
    ? text.replace(`walked ${ROUTE_PLACEHOLDER}, `, "")
    : text.replace(` ${ROUTE_PLACEHOLDER}`, "");
}
