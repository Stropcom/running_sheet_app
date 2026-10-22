// Where people sit in a vehicle, read only from what the rows already say.
//
// A seat comes from one of two places, never from a guess:
//   1. How an occupant list was worded — "MENON driver and sole occupant",
//      "HOGAN driver, CORNELL front passenger", "BAIG driver UM1 front
//      passenger and JOHNSON rear passenger".
//   2. The door or seat a person got in by — "IBARRA ... entered Vehicle
//      1MEN83 via the front passenger door", "entered the rear passenger
//      seat", "entered via the driver's door".
//
// A seat then stays with the person for as long as they stay in that vehicle,
// until a later row says something different (the same rule as everywhere else
// in the Target Logger: a row's word stands until a later row changes it). The
// departure sentence is pre-filled with those seats; the officer reads and
// edits it before it is saved, and rows already typed are never changed.
//
// Three seats only: driver, front passenger, rear passenger. Where the wording
// does not say which — "entered the vehicle", "the front seat", "the passenger
// door", "the boot" — no seat is given.

export type Seat = "driver" | "front passenger" | "rear passenger";

// Getting into a vehicle however it is worded (the same verbs the movement
// reader uses for entering one).
const ENTRY_VERB_RE =
  /\b(?:entered|got\s+(?:in|into)|climbed\s+(?:in|into)|jumped\s+(?:in|into)|boarded|sat\s+in|seated)\b/gi;

// "rear passenger door", "rear left seat", "back seat", "rear door",
// "rear driver's side door".
const REAR_RE = /\b(?:rear|back)\s+(?:left|right|passenger|seat|door|driver)/i;
// "front passenger door / seat", "front left door", "the passenger seat". Not
// "the front seat" or "the front door" (either front seat), nor a bare
// "passenger door" (it could be a rear one).
const FRONT_RE = /\bfront\s+(?:left\b|passenger\b)|\bpassenger'?s?\s+seat\b/i;
const DRIVER_RE = /\bdriver\b/i;

/** The seat a stretch of wording names, or null when it names none. Rear is
 * tested first so "rear passenger seat" is not read as the passenger seat. */
export function seatOfPhrase(phrase: string): Seat | null {
  if (REAR_RE.test(phrase)) return "rear passenger";
  if (FRONT_RE.test(phrase)) return "front passenger";
  if (DRIVER_RE.test(phrase)) return "driver";
  return null;
}

/**
 * The seat a sentence says someone got into: the wording after the verb that
 * says they got in ("... then entered Vehicle 1MEN83 via the front passenger
 * door."). Null when it says none — and when the sentence has more than one
 * "got in" (two people, possibly by different doors, cannot be told apart).
 */
export function entrySeat(sentence: string): Seat | null {
  const re = new RegExp(ENTRY_VERB_RE.source, "gi");
  const hits: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence ?? ""))) hits.push(m.index);
  if (hits.length !== 1) return null;
  const clause = sentence.slice(hits[0]).split(/[.\n]/)[0];
  return seatOfPhrase(clause);
}

const surnames = (name: string): string[] =>
  name.match(/\b[A-Z][A-Z'-]+\b|\bU[MFCP]\d+\b/g) ?? [];
const sharesSurname = (a: string, b: string) => {
  const t = surnames(b);
  return surnames(a).some(x => t.includes(x));
};
const splitNames = (names: string): string[] =>
  names
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map(n => n.trim())
    .filter(n => /[A-Za-z0-9]/.test(n));

const ROLE_RE = /\b(driver|front passenger|rear passenger|back passenger)\b/gi;

/**
 * The seats an occupant list's own wording gives: "MENON driver and sole
 * occupant" → MENON driver; "BAIG driver UM1 front passenger and JOHNSON rear
 * passenger" → BAIG driver, UM1 front passenger, JOHNSON rear passenger. A
 * role that does not follow exactly one person is skipped.
 */
export function seatsInWording(desc: string): { name: string; seat: Seat }[] {
  const out: { name: string; seat: Seat }[] = [];
  const re = new RegExp(ROLE_RE.source, "gi");
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc ?? ""))) {
    const segment = desc.slice(from, m.index);
    from = m.index + m[0].length;
    const people = splitNames(
      segment.replace(/\b(?:sole\s+occupant|occupants?)\b/gi, ",")
    );
    const role = m[1].toLowerCase();
    if (people.length === 1)
      out.push({
        name: people[0],
        seat: role === "back passenger" ? "rear passenger" : (role as Seat),
      });
  }
  return out;
}

export interface SeatPlacement {
  name: string;
  rego: string;
  rowId: number;
  seat?: Seat;
}

const UNIQUE_SEATS: Seat[] = ["driver", "front passenger"];

/**
 * The seat of each person in a vehicle: the latest one a row stated for them —
 * the occupant wording of the vehicle's own row (`descRowId`) or the door they
 * got in by (a placement in this vehicle) — whichever row is newer. A person
 * with no stated seat has none. The driver's and the front passenger's seats
 * hold one person: when two people end up with the same one, the newer
 * statement keeps it and the older loses it (the rows no longer say where that
 * person is); equal rows keep neither.
 */
export function seatsOf(input: {
  desc: string;
  descRowId: number;
  rego: string;
  occupants: string[];
  placements: SeatPlacement[];
}): Map<string, Seat> {
  const fromDesc = seatsInWording(input.desc);
  const rego = input.rego.toUpperCase();
  const picked: { person: string; seat: Seat; rowId: number }[] = [];
  for (const person of input.occupants) {
    let best: { seat: Seat; rowId: number } | null = null;
    const d = fromDesc.find(x => sharesSurname(x.name, person));
    if (d) best = { seat: d.seat, rowId: input.descRowId };
    for (const p of input.placements) {
      if (p.rego.toUpperCase() !== rego || !p.seat) continue;
      if (!sharesSurname(p.name, person)) continue;
      if (!best || p.rowId > best.rowId)
        best = { seat: p.seat, rowId: p.rowId };
    }
    if (best) picked.push({ person, ...best });
  }
  const result = new Map<string, Seat>();
  for (const seat of UNIQUE_SEATS) {
    const claimants = picked.filter(x => x.seat === seat);
    if (claimants.length === 0) continue;
    const newest = Math.max(...claimants.map(x => x.rowId));
    const winners = claimants.filter(x => x.rowId === newest);
    if (winners.length === 1) result.set(winners[0].person, seat);
  }
  for (const x of picked)
    if (x.seat === "rear passenger") result.set(x.person, x.seat);
  return result;
}

/**
 * A departure's occupants worded with their seats — "MENON driver and IBARRA
 * front passenger" — for a vehicle with two or more people in it where at least
 * one seat is known. Null otherwise (the caller keeps its usual wording): one
 * occupant, or no seat stated anywhere.
 */
export function seatedOccupantWording(input: {
  desc: string;
  descRowId: number;
  rego: string;
  occupants: string[];
  placements: SeatPlacement[];
}): string | null {
  if (input.occupants.length < 2) return null;
  const seats = seatsOf(input);
  if (seats.size === 0) return null;
  const items = input.occupants.map(o =>
    seats.has(o) ? `${o} ${seats.get(o)}` : o
  );
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
