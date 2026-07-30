// Parses the free-text sections of the "afp_target_profile" template
// (everything except the demographic table, which is handled by
// tableExtract.ts) out of a full-page OCR pass.
//
// Vehicles and Location of Interest sit side-by-side in the source layout,
// so a line-by-line OCR read interleaves their words rather than reading
// one after the other — regex anchors below are written to tolerate that
// jumbling rather than assume clean column order.

export interface ParsedSections {
  vehicles: string[];
  currentAddress: string;
  previousAddress: string;
  summary: string;
  communications: string[];
}

// Vehicle lines follow a recognizable structured format: REGO (STATE) YEAR
// COLOUR MAKE MODEL BODYTYPE — this is contiguous text even when the
// surrounding line also carries jumbled Location-of-Interest words. Matched
// against a newline-collapsed copy of the text: OCR line-wraps land in
// different places than the source document's own line breaks (the rego
// and body-type word can end up split across two OCR'd lines), so a
// newline-sensitive match misses real matches for no good reason here.
const VEHICLE_RE =
  /\b[A-Z0-9]{4,7}\s*\((?:WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\)[\s\S]{0,80}?\b(?:sedan|wagon|hatch|ute|van|motorcycle|truck|suv)\b\.?/gi;

const PHONE_RE = /\b0[0-9](?:[ -]?[0-9]){8}\b/g;

// The word before "Address" ("Current"/"Previous") is exactly the kind of
// short, low-context word OCR mangles worst (seen in testing: "Previous"
// split into "Previo US"). The literal word "Address" itself reads far more
// reliably, and the template always has exactly two — current, then
// previous — so anchor on that pair instead of trusting the adjective.
const ADDRESS_RE = /address:?/gi;

function textBetween(text: string, from: number, endMarker: RegExp): string {
  endMarker.lastIndex = from;
  const endMatch = endMarker.exec(text);
  const to = endMatch ? endMatch.index : text.length;
  return text.slice(from, to).replace(/\s+/g, " ").trim();
}

export function parseSections(fullPageText: string): ParsedSections {
  const collapsed = fullPageText.replace(/\r?\n/g, " ");
  const vehicles = Array.from(collapsed.matchAll(VEHICLE_RE)).map(m =>
    m[0].replace(/\s+/g, " ").trim()
  );

  const addressMatches = Array.from(fullPageText.matchAll(ADDRESS_RE));
  let currentAddress = "";
  let previousAddress = "";
  if (addressMatches.length >= 2) {
    const [first, second] = addressMatches;
    currentAddress = textBetween(
      fullPageText,
      first.index + first[0].length,
      ADDRESS_RE
    );
    previousAddress = textBetween(
      fullPageText,
      second.index + second[0].length,
      /\bsummary\b/i
    );
  }

  const summaryStart = /\bsummary\b/i.exec(fullPageText);
  const summary = summaryStart
    ? textBetween(
        fullPageText,
        summaryStart.index + summaryStart[0].length,
        /\b(?:protected|australian federal police|communications)\b/i
      )
    : "";

  const communications = Array.from(
    new Set(Array.from(fullPageText.matchAll(PHONE_RE)).map(m => m[0].trim()))
  );

  return { vehicles, currentAddress, previousAddress, summary, communications };
}
