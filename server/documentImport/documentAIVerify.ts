// "AI proposes, deterministic code disposes." Re-validates every AI
// suggestion produced by localDocumentAI.ts by running it back through the
// app's own trusted, well-tested parsers (addressLineParser.ts /
// vehicleLineParser.ts) before it's ever shown to an officer. A suggestion
// that doesn't parse to a confident result through the same rules real
// document text goes through is discarded outright — never surfaced as a
// raw, unverified model string. This is what keeps the AI assist
// additive-safe: the worst case an officer ever sees is a real,
// rule-parsed address/vehicle, indistinguishable in kind from every other
// field this pipeline produces, never something only the model vouches
// for.
import { parseAddressLine, type ParsedAddressLine } from "./addressLineParser";
import { parseVehicleLine, type ParsedVehicleLine } from "./vehicleLineParser";
import type { NeedsReviewKind } from "./localDocumentAI";

export type AIAssistOutcome =
  /** The model had nothing usable, or what it proposed didn't parse to a
   * confident result through the same rules everything else in this
   * pipeline goes through — treated exactly like "no suggestion". */
  | { status: "declined" }
  /** The model's independent reading, once re-parsed, matches the rules'
   * own existing reading — only possible for the low-confidence
   * verify-and-correct pass, which is the only one with an existing
   * reading to compare against. */
  | { status: "confirmed"; value: string }
  /** The model proposes a different, deterministically-verified reading —
   * shown for review, never applied automatically. */
  | { status: "suggested"; value: string };

/**
 * `suggested` is the model's raw reply (already passed through
 * localDocumentAI.ts's parseModelReply, so it's not empty and not one of
 * its UNKNOWN_MARKERS). `currentValue` is the rules' own existing
 * composed reading for this field — pass null for a needsReview item
 * (targetProfileFieldMap.ts's UnparsedItem), which has no existing
 * reading to compare against and so can only ever come back "declined" or
 * "suggested", never "confirmed".
 */
export function verifyAISuggestion(
  kind: NeedsReviewKind,
  suggested: string,
  currentValue: string | null
): AIAssistOutcome {
  const parsed =
    kind === "address"
      ? parseAddressLine(suggested)
      : parseVehicleLine(suggested);
  if (!parsed || !parsed.confident) return { status: "declined" };
  const composed = composeParsedValue(kind, parsed);
  if (
    currentValue &&
    normalizeForCompare(composed) === normalizeForCompare(currentValue)
  ) {
    return { status: "confirmed", value: composed };
  }
  return { status: "suggested", value: composed };
}

/**
 * Builds the same plain-text reading from a ParsedAddressLine/
 * ParsedVehicleLine that verifyAISuggestion composes from the model's
 * re-parsed reply — callers use this to turn the rules' own existing
 * mapped.addresses[i]/mapped.vehicles[i] entry into the `currentValue`
 * verifyAISuggestion compares against, so both sides of the comparison
 * are built the same way.
 */
export function composeParsedValue(
  kind: NeedsReviewKind,
  parsed: ParsedAddressLine | ParsedVehicleLine
): string {
  if (kind === "address") {
    const a = parsed as ParsedAddressLine;
    const streetPart = [
      a.unitNo && `${a.unitNo}/`,
      a.houseNo,
      a.streetName,
      a.streetType,
    ]
      .filter(Boolean)
      .join(" ");
    return [streetPart, [a.suburb, a.state].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
  }
  const v = parsed as ParsedVehicleLine;
  return [
    v.registration && v.state
      ? `${v.registration} (${v.state})`
      : v.registration,
    v.colour,
    v.make,
    v.model,
    v.vehicleType,
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
