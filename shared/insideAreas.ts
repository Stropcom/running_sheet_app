/**
 * Areas inside a building.
 *
 * "entered the elevators", "entered the gym", "went to the pool area": the people
 * are still in the building they were already logged inside (Crown Towers,
 * a hotel, a hospital, a shopping centre). Treated as a new place, the sentence
 * moved the Target Logger and the map flag off the building onto "the elevators",
 * which is nowhere on a map. So a name made only of generic area words — a lift,
 * a lobby, a gym, a pool, a floor or level, a room, a bar — is "an area within a
 * place", and the scanner (shared/walkEventPatterns.ts) keeps people where they
 * were when one is entered or left while they are logged inside somewhere.
 *
 * Deliberately narrow: a name with any other word in it (a proper name such as
 * "Crown Towers lobby", "The Camfield", "Town Hall") is NOT an area, so it is read
 * as a place of its own, exactly as before. To teach it another area, add the
 * word to AREA_WORDS and a test. Pure rule; tests in server/insideAreas.test.ts.
 */

/** The words that name a part of a building. */
const AREA_WORDS = new Set([
  "elevator",
  "elevators",
  "lift",
  "lifts",
  "lobby",
  "foyer",
  "reception",
  "atrium",
  "stairs",
  "stairwell",
  "staircase",
  "escalator",
  "escalators",
  "corridor",
  "hallway",
  "room",
  "rooms",
  "suite",
  "penthouse",
  "gym",
  "gymnasium",
  "pool",
  "spa",
  "sauna",
  "bar",
  "lounge",
  "restaurant",
  "ballroom",
  "balcony",
  "rooftop",
  "toilet",
  "toilets",
  "bathroom",
  "bathrooms",
  "restroom",
  "restrooms",
  "amenities",
  "floor",
  "level",
  "desk",
  "concierge",
]);

/** Words that only describe an area ("the hotel room", "the swimming pool area",
 * "the 12th floor"). Never enough on their own. */
const MODIFIER_WORDS = new Set([
  "the",
  "a",
  "an",
  "hotel",
  "guest",
  "main",
  "front",
  "rear",
  "back",
  "ground",
  "upper",
  "lower",
  "top",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "conference",
  "function",
  "meeting",
  "dining",
  "fitness",
  "swimming",
  "indoor",
  "outdoor",
  "public",
  "staff",
  "private",
  "vip",
  "area",
  "zone",
  "section",
  "no",
  "number",
]);

/** True when `place` names only a part of a building: a lift, lobby, gym, pool,
 * floor, room, bar and the like, with nothing that names a specific venue. */
export function isAreaWithinPlace(place: string | null | undefined): boolean {
  const words = (place ?? "")
    .toLowerCase()
    .replace(/[(),.;:]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  let area = false;
  for (const w of words) {
    if (AREA_WORDS.has(w)) area = true;
    else if (MODIFIER_WORDS.has(w)) continue;
    else if (/^\d+(?:st|nd|rd|th)?$/.test(w)) continue;
    else return false;
  }
  return area;
}
