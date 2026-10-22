// Square signs for banks, post offices, pubs, hotels (accommodation), gyms,
// shopping centres, supermarkets, cafes, restaurants, fast food / takeaway and
// airports —
// the same idea as the bus stop and train station signs
// (shared/transitPlace.ts): the default map pin of a place that is one of
// these is its sign instead of the house, however the place got into the
// sheet (tapped on the map, picked from the suggestions, or typed).
//
// Two ways to tell, both deterministic:
//   1. Google's place types, when we have them (a tapped place, a suggestion):
//      bank / atm, post_office, bar, lodging, gym, shopping_mall, supermarket /
//      grocery, cafe, restaurant, fast food / takeaway, airport.
//   2. The way the place is written — its NAME, the first part of the label
//      ("Commonwealth Bank East Victoria Park Branch, Shop 19 The Park Centre,
//      789 Albany Highway, …"), never the street part, so "Bank Street" or
//      "Shop 19 The Park Centre" can't tag a place by accident.
//
// Never guesses: a bare "… Hotel" is a pub in much of Australia and
// accommodation elsewhere, so the wording alone only says accommodation for a
// known hotel brand or a motel / resort / lodge; otherwise Google's type (or
// the officer's own choice) decides. An officer's own chosen icon always wins
// — callers only use this as the default.

import { transitSignIconOf } from "./transitPlace";

export type PlaceSignIcon =
  | "place_bank"
  | "place_post_office"
  | "place_pub"
  | "place_hotel"
  | "place_gym"
  | "place_shopping_centre"
  | "place_supermarket"
  | "place_cafe"
  | "place_restaurant"
  | "place_fast_food"
  | "place_airport";

export const PLACE_SIGN_ICONS: PlaceSignIcon[] = [
  "place_bank",
  "place_post_office",
  "place_pub",
  "place_hotel",
  "place_gym",
  "place_shopping_centre",
  "place_supermarket",
  "place_cafe",
  "place_restaurant",
  "place_fast_food",
  "place_airport",
];

const STREET_END_RE =
  /\b(?:street|road|avenue|drive|highway|way|court|place|crescent|boulevard|terrace|parade|lane|close|circuit|freeway|grove|esplanade|parkway|loop|rise|walk|promenade|mews|st|rd|ave|av|dr|hwy|ct|pl|cres|blvd|tce|pde|ln|cl|cct|fwy|gr|esp|pwy)$/i;
const STREET_MALL_RE = /\b(?:street|road|avenue|drive|way|lane)\s+mall$/i;

const ACCOMMODATION_RE =
  /\b(?:motel|resort|hostel|backpackers?|serviced\s+apartments?|apartments?|suites|guest\s*house|bed\s+and\s+breakfast|b\s*&\s*b|inn|crowne\s+plaza|holiday\s+inn|travelodge|best\s+western)\b|\b(?:(?<!masonic\s)(?<!orange\s)(?<!rotary\s)(?<!lions\s)lodge)\b/i;
const HOTEL_BRAND_RE =
  /\b(?:ibis|novotel|mercure|hilton|hyatt|marriott|sheraton|radisson|rydges|pullman|sofitel|doubletree|intercontinental|westin|quest|sebel|adina|atura|pan\s+pacific|shangri-la|ritz|four\s+seasons|moxy|aloft|citadines|ovolo|boutique|quality|comfort|mgallery|dusit|swissotel|treasury|langham|park\s+royal)\b/i;
const HOTEL_WORD_RE = /\bhotel\b/i;
const PUB_RE =
  /\b(?:tavern|pub|taphouse|tap\s+house|alehouse|ale\s+house|brewery|brewhouse|brew\s+house|saloon|public\s+house|bar)\b/i;
const NOT_A_PUB_BAR_RE =
  /\b(?:salad|sushi|noodle|snack|juice|milk|coffee|candy|chocolate|protein|oyster|burger|taco|ramen|poke|yoghurt|yogurt|acai|smoothie|sandwich|raw|gelato|sand)\s+bar\b/i;
const POST_RE =
  /\bpost\s+(?:office|shop)\b|\baustralia\s+post\b|\blpo\b|\blicensed\s+post\s+office\b/i;
const NOT_A_BANK_RE =
  /\b(?:blood|food|river|sperm|seed|piggy|memory|sand|west|left|east|north|south)\s+bank\b/i;
const BANK_RE =
  /\b(?:bank|bankwest|citibank|westpac|credit\s+union|building\s+society|atm)\b/i;
const BANK_CAPS_RE = /\b(?:ANZ|NAB|BOQ|HSBC|ATM)\b/;
const GYM_RE =
  /\b(?:gym|gymnasium|fitness|crossfit|pilates|f45|orangetheory|health\s+club|jetts|fitstop)\b/i;
const CENTRE_RE =
  /\bshopping\s+(?:centre|center|mall|plaza|village|square|arcade|complex|precinct)\b|\btown\s+centre\b|\bwestfield\b|\bgalleria\b/i;

// A supermarket by its name: the word, or one of the big grocery chains.
// "Coles Bay" is a town, not a shop; a chain's petrol station, liquor store,
// pharmacy or head office is not the supermarket.
const SUPERMARKET_RE =
  /\bsupermarkets?\b|\b(?:woolworths|aldi|iga|foodland|foodworks|spudshed|harris\s+farm)\b|\bcoles\b(?!\s+(?:bay|point|beach|creek|park|island)\b)/i;
const NOT_A_SUPERMARKET_RE =
  /\b(?:express|petrol|fuel|servo|liquor|bws|dan\s+murphy'?s?|pharmacy|chemist|car\s*park|parking|distribution|depot|warehouse|head\s+office|support\s+office)\b/i;

const CAFE_RE =
  /\b(?:cafes?|coffee|espresso|roasters?|roastery|barista|starbucks|gloria\s+jean'?s|zarraffa'?s)\b/i;
const FAST_FOOD_RE =
  /\b(?:burgers?|takeaway|take-?away|fast\s+food|fish\s+(?:and|&)\s+chips|fish\s*n\s*chips|kebabs?|mcdonald'?s|macca'?s|hungry\s+jack'?s|kfc|subway(?!\s+station)|red\s+rooster|domino'?s|pizza\s+hut|nando'?s|grill'?d|oporto|chicken\s+treat|zambrero|guzman|taco\s+bell|krispy\s+kreme)\b/i;
const RESTAURANT_RE =
  /\b(?:restaurant|bistro|brasserie|trattoria|osteria|ristorante|pizzeria|diner|grill|eatery|steakhouse|cantina|izakaya|kitchen)\b/i;
const AIRPORT_RE =
  /\b(?:airport|airfield|aerodrome|airstrip)\b|\b(?:domestic|international|regional)\s+terminal\b/i;
// An airport's car park, station, hotel… is not the airport.
const NOT_AN_AIRPORT_RE =
  /\b(?:station|parking|car\s*park|taxi|shuttle|police|fire|freight|cargo|storage|motel|hotel|inn|lodge|apartments?)\b/i;

// A numbered terminal ("Terminal 4") is only read as an airport terminal when
// the rest of its label says the place is at an airport — the locality part,
// as Google writes it: "Terminal 4, Perth Airport WA 6105, Australia". A bare
// "Terminal 1" could be a port or a bus terminal, so it is never guessed, and
// a street called "Airport Drive" does not count (the part must END in the
// airport's name, with at most a state and postcode after it).
const NUMBERED_TERMINAL_RE =
  /^terminal\s+\d+[a-z]?(?:\s+(?:domestic|international|regional))?$/i;
const AIRPORT_LOCALITY_RE =
  /\b(?:airport|airfield|aerodrome)(?:\s+(?:wa|nsw|vic|qld|sa|tas|nt|act))?(?:\s+\d{4})?$/i;

/** The first part of a location label — the place's own name, with accents
 * and curly apostrophes made plain ("Café" → "Cafe"). */
function nameOf(label: string): string {
  const first = (label ?? "").split(",")[0] ?? "";
  return first
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The sign for a place judged by its written name, or null. */
export function placeSignOfName(label: string): PlaceSignIcon | null {
  const name = nameOf(label);
  if (!name) return null;
  // A street (or a street address) ends in a street type; a number at the
  // front is not enough to say so — "8 Knots Tavern" is a pub.
  if (STREET_END_RE.test(name) || STREET_MALL_RE.test(name)) return null;

  if (ACCOMMODATION_RE.test(name)) return "place_hotel";
  if (PUB_RE.test(name) && !NOT_A_PUB_BAR_RE.test(name)) return "place_pub";
  if (HOTEL_WORD_RE.test(name)) {
    // "Esplanade Hotel" is a pub, "Ibis Styles Hotel" is not — only a known
    // brand says accommodation; anything else is left to Google's type.
    return HOTEL_BRAND_RE.test(name) ? "place_hotel" : null;
  }
  if (POST_RE.test(name)) return "place_post_office";
  if (
    (BANK_RE.test(name) && !NOT_A_BANK_RE.test(name)) ||
    BANK_CAPS_RE.test(name)
  )
    return "place_bank";
  if (GYM_RE.test(name)) return "place_gym";
  if (CENTRE_RE.test(name)) return "place_shopping_centre";
  if (SUPERMARKET_RE.test(name) && !NOT_A_SUPERMARKET_RE.test(name))
    return "place_supermarket";
  // "Hungry Jack's Airport" is a burger place; the airport comes last.
  if (CAFE_RE.test(name)) return "place_cafe";
  if (FAST_FOOD_RE.test(name)) return "place_fast_food";
  if (RESTAURANT_RE.test(name)) return "place_restaurant";
  if (AIRPORT_RE.test(name) && !NOT_AN_AIRPORT_RE.test(name))
    return "place_airport";
  // "Terminal 4, Perth Airport WA 6105, Australia": a numbered terminal whose
  // locality is an airport. Each terminal is its own place; the sign is the same.
  if (NUMBERED_TERMINAL_RE.test(name)) {
    const rest = (label ?? "").split(",").slice(1);
    if (rest.some(part => AIRPORT_LOCALITY_RE.test(part.trim())))
      return "place_airport";
  }
  return null;
}

/** The sign for a place from Google's types, or null. A place that is both a
 * bar and lodging ("X Hotel") is a pub unless its name says accommodation. */
export function placeSignFromTypes(
  types: readonly string[] | undefined | null,
  name = ""
): PlaceSignIcon | null {
  const t = new Set((types ?? []).map(x => x.toLowerCase()));
  if (t.size === 0) return null;
  if (t.has("post_office")) return "place_post_office";
  if (t.has("bank") || t.has("atm")) return "place_bank";
  if (t.has("gym") || t.has("fitness_center")) return "place_gym";
  if (t.has("shopping_mall")) return "place_shopping_centre";
  if (t.has("airport") || t.has("international_airport"))
    return "place_airport";
  // Google's supermarket / grocery types (a mall that holds one is still the
  // mall, settled above). A chain's petrol station or liquor store carries
  // other types and is not this.
  if (
    (t.has("supermarket") ||
      t.has("grocery_store") ||
      t.has("grocery_or_supermarket")) &&
    !NOT_A_SUPERMARKET_RE.test(name)
  )
    return "place_supermarket";
  const lodging = t.has("lodging");
  const bar = t.has("bar");
  if (lodging && bar)
    return ACCOMMODATION_RE.test(name) || HOTEL_BRAND_RE.test(name)
      ? "place_hotel"
      : "place_pub";
  if (lodging) return "place_hotel";
  if (bar) return "place_pub";
  // Food: a pub or hotel with a restaurant was settled above. A place that is
  // both a cafe and a restaurant is a cafe only when its name says so.
  const cafe = t.has("cafe") || t.has("coffee_shop");
  const restaurant = t.has("restaurant");
  if (t.has("fast_food_restaurant") || t.has("hamburger_restaurant"))
    return "place_fast_food";
  if (cafe && restaurant)
    return CAFE_RE.test(nameOf(name)) ? "place_cafe" : "place_restaurant";
  if (cafe) return "place_cafe";
  if (restaurant) return "place_restaurant";
  if (t.has("meal_takeaway")) return "place_fast_food";
  return null;
}

/** A tapped or picked place: Google's types first, then how it is written. */
export function placeSignFor(
  name: string,
  types: readonly string[] | undefined | null
): PlaceSignIcon | null {
  return placeSignFromTypes(types, name) ?? placeSignOfName(name);
}

/** The default icon of a map pin made from a written place: a bus stop or
 * train station sign, else one of these signs, else null (the house). */
export function signIconOf(label: string): string | null {
  return transitSignIconOf(label) ?? placeSignOfName(label);
}
