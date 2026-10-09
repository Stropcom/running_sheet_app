// What a running sheet is tracking: the ONE rule the sheet's tracker cards, the
// map's location flag and the map popup all use, so they can never disagree
// about who or what "the target" is.
//
// A sheet is filed under a Target Registry entry, and that target has a type:
//   - person   — tracked by surname ("RAHMAN"); his position is wherever the
//                rows put him (inside a place, walking, in a vehicle ...)
//   - vehicle  — tracked by registration ("E426HOD"); its position is where
//                the vehicle is (parked at an address, departed, out of sight)
//   - location — a place, not something that moves, so there is no moving
//                position to flag
// Before this, every caller read the sheet title's bracket as a person's
// surname, so a vehicle target's title ("(E426HOD WHITE TOYOTA CAMRY SEDAN)")
// was never recognised and its cards and flag never appeared.
import {
  companionsOf,
  pickTargetCardKey,
  targetTokenFromTitle,
  type TargetCardInput,
} from "./targetCard";
import { VEHICLE_REGO_PATTERN, regoIn } from "./vehicleRego";

export type TrackedTarget =
  | { kind: "person"; token: string }
  | { kind: "vehicle"; rego: string }
  | { kind: "location" };

/** The fields of the sheet's Target Registry entry the rule needs. */
export interface TrackedTargetSource {
  targetType?: string | null;
  surname?: string | null;
  vehRegistration?: string | null;
}

const bracketOf = (title: string | null | undefined): string | null =>
  (title ?? "").match(/\(([^()]+)\)\s*$/)?.[1]?.trim() ?? null;

/** Whether `word` is, on its own, a registration plate. */
const isRego = (word: string) => {
  const m = word.match(VEHICLE_REGO_PATTERN);
  return !!m && m[0].length === word.length;
};

/**
 * What the sheet tracks. `target` is the sheet's linked Target Registry entry
 * when known (it is exact); without it the title's bracket is read the way the
 * app writes it — a surname for a person, "REGO COLOUR MAKE MODEL" for a
 * vehicle.
 */
export function resolveTrackedTarget(args: {
  title?: string | null;
  target?: TrackedTargetSource | null;
}): TrackedTarget | null {
  const { title, target } = args;
  const type = target?.targetType ?? null;

  if (type === "vehicle") {
    const rego =
      regoIn((target?.vehRegistration ?? "").replace(/[^A-Za-z0-9]/g, "")) ??
      regoIn(bracketOf(title));
    return rego ? { kind: "vehicle", rego } : null;
  }
  if (type === "location") return { kind: "location" };

  const surname = (target?.surname ?? "").trim();
  const token = /^[A-Za-z'-]{2,}$/.test(surname)
    ? surname.toUpperCase()
    : targetTokenFromTitle(title);
  if (token) return { kind: "person", token };

  // No linked target to ask: a bracket that opens with a plate is a vehicle.
  if (!target) {
    const first = bracketOf(title)?.split(/\s+/)[0] ?? "";
    if (first && isRego(first)) {
      return { kind: "vehicle", rego: first.toUpperCase() };
    }
  }
  return null;
}

/** The word the target is named by: his surname, or the vehicle's rego. */
export function trackedTargetCode(t: TrackedTarget | null): string | null {
  return t?.kind === "person" ? t.token : t?.kind === "vehicle" ? t.rego : null;
}

/** The key of the tracker card that holds the target, if any. A person is
 * held by the card naming him; a vehicle by its own card (veh-/dep-/vnl-REGO).
 * The newest card wins. */
export function pickSubjectCardKey(
  cards: TargetCardInput[],
  t: TrackedTarget | null
): string | null {
  if (t?.kind === "person") return pickTargetCardKey(cards, t.token);
  if (t?.kind === "vehicle") {
    const suffix = `-${t.rego}`;
    const mine = cards.filter(c => {
      const k = c.key.toUpperCase();
      return /^(VEH|DEP|VNL)-/.test(k) && k.endsWith(suffix);
    });
    if (mine.length === 0) return null;
    return mine.reduce((a, b) => (b.latestRowId > a.latestRowId ? b : a)).key;
  }
  return null;
}

/** Others shown with the target on its card: for a person, everyone but him;
 * for a vehicle, everyone in it. */
export function subjectCompanions(
  people: string[],
  t: TrackedTarget | null
): string[] {
  if (t?.kind === "person") return companionsOf(people, t.token);
  if (t?.kind === "vehicle") return people;
  return [];
}
