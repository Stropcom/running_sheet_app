// A registered target seen DRIVING a vehicle that isn't on his registry (a
// business car, a hire car) is filed on his registry automatically, as the
// next vehicle, filled in from what the row itself says about it. Pure rules
// only — reading the row, matching the driver to the target and composing the
// registry entry; the database part is `autoRegisterDriverVehicles` in
// server/db.ts. Deterministic and offline: no model, no lookups.
//
// Deliberately narrow, because a registry entry feeds chips, flags,
// associations and exports and is a legal record:
//   - only the DRIVER (or sole occupant written as "NAME driver …") counts —
//     a passenger, "unseen occupants", "male driver" never do;
//   - the driver must be the sheet's own registered target, matched on an
//     all-capitals surname written in capitals (never case-insensitively) and
//     compatible given names, and never someone else registered under the
//     same surname;
//   - only what the row states is filled in; nothing is guessed.
import {
  aliasMentionCompatible,
  mentionIsOtherRegisteredPerson,
} from "./personAliasMatch";
import {
  COLOURS,
  COLOUR_MODIFIERS,
  stripVehicleType,
} from "./documentImport/vehicleLineParser";
import { VEHICLE_MAKES_PATTERN } from "../shared/vehicleModel";
import { lowerVehicleColour } from "../shared/vehicleColour";

const REGO_SHAPE = /^(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]{4,10}$/;

const OCCUPANT_CLAUSE_END =
  /,\s*(?:departed|reversed|exited|arrived|parked|stopped|travell?ed|travelling|driving|drove|unattended)\b/i;

export interface DriverVehicle {
  rego: string;
  /** The driver as written, bracket and all: "Paul HOGAN (HOGAN)". */
  driverName: string;
}

/** Every vehicle in `text` whose occupants are written "NAME driver …" right
 * after its "Vehicle REGO" / "(Vehicle REGO)" mention. */
export function driverVehiclesInText(text: string): DriverVehicle[] {
  const out: DriverVehicle[] = [];
  const mention = /(?:\(Vehicle|\bVehicle)\s+([A-Za-z0-9-]{4,10})\)?/gi;
  let m: RegExpExecArray | null;
  while ((m = mention.exec(text)) !== null) {
    const rego = m[1].toUpperCase();
    if (!REGO_SHAPE.test(rego)) continue;
    let rest = text.slice(m.index + m[0].length);
    rest = rest.replace(/^[\s,]+/, "");
    // This vehicle's own clause: up to the next vehicle mention or the end of
    // the sentence.
    const next = rest.search(/\(Vehicle\s|\bVehicle\s+[A-Za-z0-9]{5,8}\b/i);
    if (next >= 0) rest = rest.slice(0, next);
    const stop = rest.search(/\.(?:\s|$)|\n/);
    if (stop >= 0) rest = rest.slice(0, stop);
    const end = rest.search(OCCUPANT_CLAUSE_END);
    const occupants = end >= 0 ? rest.slice(0, end) : rest;
    const d = /(?:^|,|\band\b)\s*([^,]*?)\s+driver\b/i.exec(occupants);
    if (!d) continue;
    const name = d[1].replace(/\s+/g, " ").trim();
    // A named person has an all-capitals surname; "unseen", "male", "UM1" and
    // the like never do.
    if (!name.split(" ").some(w => /^[A-Z][A-Z'’-]+$/.test(w))) continue;
    if (!out.some(o => o.rego === rego && o.driverName === name))
      out.push({ rego, driverName: name });
  }
  return out;
}

export interface RegisteredTargetLike {
  surname: string | null;
  name: string;
}

/** True when the driver as written is this registered target and not another
 * person who shares the surname. */
export function driverIsTarget(
  driverName: string,
  target: RegisteredTargetLike,
  otherRegisteredNames: readonly string[] = []
): boolean {
  const surname = (target.surname ?? "").trim().toUpperCase();
  if (!surname) return false;
  const bare = driverName.replace(/\s*\([^()]*\)\s*/g, " ").trim();
  // The surname, written in capitals, as a whole word.
  if (!bare.split(/\s+/).some(w => w === surname)) return false;
  if (!aliasMentionCompatible(bare, surname, target.name)) return false;
  if (
    mentionIsOtherRegisteredPerson(bare, surname, target.name, otherRegisteredNames)
  )
    return false;
  return true;
}

export interface ObservedVehicle {
  state: string;
  colour: string;
  make: string;
  model: string;
  vehicleType: string;
}

const MULTI_WORD_MAKES: Array<[string, string]> = [
  ["mercedes", "benz"],
  ["land", "rover"],
  ["range", "rover"],
  ["alfa", "romeo"],
  ["great", "wall"],
  ["rolls", "royce"],
  ["aston", "martin"],
  ["harley", "davidson"],
];
// Makes the shared list leaves out (motorcycles, trucks).
const EXTRA_MAKES = new Set(
  "harley ducati kawasaki yamaha ktm triumph vespa hino scania iveco fuso man kenworth freightliner mack".split(
    " "
  )
);

function isMake(word: string): boolean {
  const w = word.toLowerCase();
  return VEHICLE_MAKES_PATTERN.test(w) || EXTRA_MAKES.has(w);
}

/** What the row says about the vehicle with this rego — the clause in front of
 * its "(Vehicle REGO)" bracket, in the form "a blue Mercedes Benz C200, sedan,
 * bearing WA registration 1FAB007". Null when it isn't described there. */
export function describeVehicleInText(
  text: string,
  rego: string
): ObservedVehicle | null {
  const bracket = new RegExp(`\\(Vehicle\\s+${rego.replace(/[-]/g, "\\-")}\\)`, "i");
  const b = bracket.exec(text);
  if (!b) return null;
  let before = text.slice(0, b.index);
  // Only this vehicle's own sentence, and only what follows an earlier
  // vehicle's bracket in a list ("…(Vehicle A), a white …").
  const sentenceCut = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("\n")
  );
  if (sentenceCut >= 0) before = before.slice(sentenceCut + 1);
  const listCut = /\(Vehicle\s[^)]*\)\s*(?:,\s*(?:and\s+)?|and\s+)/gi;
  let lm: RegExpExecArray | null;
  let cutAt = -1;
  while ((lm = listCut.exec(before)) !== null) cutAt = lm.index + lm[0].length;
  if (cutAt >= 0) before = before.slice(cutAt);

  let state = "WA";
  before = before.replace(
    /[,;]?\s*(?:bearing\s+)?(?:(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s+)?(?:regist[a-z]*|rego|reg\.?|plated?)\s*:?\s*[A-Za-z0-9-]*\s*$/i,
    (_m, st?: string) => {
      if (st) state = st.toUpperCase();
      return "";
    }
  );
  before = before.replace(/[,;]\s*$/, "").trim();
  if (!before) return null;

  // Drop narrative in front of the description: it starts after the last
  // standalone article; with no article it must open with a colour.
  const article = /\b(?:a|an|the)\s+(?=\S)/gi;
  let last = -1;
  let am: RegExpExecArray | null;
  while ((am = article.exec(before)) !== null) last = am.index + am[0].length;
  let desc = last >= 0 ? before.slice(last) : before;
  const firstWord = desc.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (last < 0 && !COLOURS.has(firstWord) && !COLOUR_MODIFIERS.has(firstWord))
    return null;

  const words = desc
    .replace(/,/g, " ")
    .replace(/\.+$/, "")
    .split(/\s+/)
    .filter(Boolean);
  let colour = "";
  if (
    words.length > 1 &&
    COLOUR_MODIFIERS.has(words[0].toLowerCase()) &&
    COLOURS.has(words[1].toLowerCase())
  ) {
    words.shift();
    colour = lowerVehicleColour(words.shift()!);
  } else if (words.length > 0 && COLOURS.has(words[0].toLowerCase())) {
    colour = lowerVehicleColour(words.shift()!);
  }
  const { rest, vehicleType } = stripVehicleType(words);
  let make = "";
  let model = "";
  if (rest.length > 0 && isMake(rest[0])) {
    const pair = MULTI_WORD_MAKES.find(
      ([a, c]) => rest[0].toLowerCase() === a && rest[1]?.toLowerCase() === c
    );
    const takes = pair ? 2 : 1;
    make = rest.slice(0, takes).join(" ");
    model = rest.slice(takes).join(" ");
  }
  if (!colour && !make) return null;
  return { state, colour, make, model, vehicleType };
}

export interface RegistryVehicleEntry {
  id: string;
  registration: string;
  state: string;
  colour: string;
  make: string;
  model: string;
  vehicleType: string;
  full: string;
  short: string;
}

/** The registry entry for `rego`, composed the way Add Target composes a
 * vehicle ("[colour] [make] [model] [type], bearing [state] registration
 * [rego] (Vehicle [rego])"), with only the parts the row stated. */
export function composeRegistryVehicle(
  rego: string,
  seen: ObservedVehicle | null,
  id: string
): RegistryVehicleEntry {
  const state = seen?.state || "WA";
  const colour = seen?.colour ?? "";
  const make = seen?.make ?? "";
  const model = seen?.model ?? "";
  const vehicleType = seen?.vehicleType ?? "";
  const short = `Vehicle ${rego}`;
  const description = [colour, make, model, vehicleType]
    .filter(Boolean)
    .join(" ");
  const full = `${description ? `${description}, ` : ""}bearing ${state} registration ${rego} (${short})`;
  return {
    id,
    registration: rego,
    state,
    colour,
    make,
    model,
    vehicleType,
    full,
    short,
  };
}
