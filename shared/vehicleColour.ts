/**
 * A vehicle's colour is always written in lower case ("white Lexus NX350h",
 * never "White Lexus"). One rule for the Target Registry (every entity that
 * can hold a vehicle) and the Intelligence folder.
 */

const COLOUR_WORDS = [
  "white",
  "black",
  "silver",
  "grey",
  "gray",
  "blue",
  "red",
  "green",
  "yellow",
  "gold",
  "brown",
  "maroon",
  "orange",
  "purple",
  "tan",
  "beige",
  "cream",
  "navy",
  "khaki",
  "pink",
  "bronze",
  "charcoal",
  "teal",
  "turquoise",
  "burgundy",
  "champagne",
  "copper",
  "aqua",
  "lime",
  "violet",
  "magenta",
  "mauve",
  "olive",
  "bordeaux",
];
const SHADE_WORDS = [
  "dark",
  "light",
  "pale",
  "bright",
  "metallic",
  "pearl",
  "deep",
  "matt",
  "matte",
  "dull",
];

const COLOUR = `(?:(?:${SHADE_WORDS.join("|")})\\s+)*(?:${COLOUR_WORDS.join("|")})`;
// "white", "dark blue", "black and silver", "red/white" — then a word boundary.
const LEADING_COLOUR = new RegExp(
  `^(\\S*\\d\\S*\\s+)?(${COLOUR}(?:\\s*(?:\\/|and|&)\\s*${COLOUR})?)(?=\\s|,|$)`,
  "i"
);

/** The value of a Colour field: trimmed, lower case. */
export function lowerVehicleColour(colour: string | null | undefined): string {
  return (colour ?? "").trim().toLowerCase();
}

/**
 * Lower-cases the colour at the start of a vehicle description, after an
 * optional registration: "1ABC123 White Lexus NX350h" → "1ABC123 white Lexus
 * NX350h"; "Dark Blue Toyota …" → "dark blue Toyota …". Anything that doesn't
 * open with a colour (or a registration then a colour) is returned unchanged.
 */
export function lowercaseLeadingColour(text: string): string {
  const m = LEADING_COLOUR.exec(text);
  if (!m) return text;
  const rego = m[1] ?? "";
  return rego + m[2].toLowerCase() + text.slice(rego.length + m[2].length);
}
