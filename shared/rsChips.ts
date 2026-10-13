/**
 * Order of the quick-insert chips on the main running sheet and in the RS
 * Quick Entry pop-up. One rule, shared by both screens:
 *
 *  - The shortcut chips follow the order of the Shortcuts page (an admin drags
 *    them into place there; it is saved on the server, so it is the same for
 *    everyone, on every sheet and device).
 *  - The chips that come from the target itself (HBF, the vehicle pairs V1F/V1,
 *    V2F/V2…, TGT, HB) cannot be moved. They sit as one block straight after
 *    SC, in this fixed order.
 *
 * Pure and deterministic so it can be tested without the screens.
 */

/** Chips taken from the target's own record rather than the Shortcuts page. */
const VEHICLE_FULL = /^V(\d+)F$/;
const VEHICLE_SHORT = /^V(\d+)$/;

/** Fixed rank of a target chip (lower = earlier), or null for any other chip. */
export function fixedChipRank(label: string): number | null {
  const l = label.toUpperCase();
  if (l === "HBF") return 0;
  let m = VEHICLE_FULL.exec(l);
  if (m) return 10 + Number(m[1]) * 2;
  m = VEHICLE_SHORT.exec(l);
  if (m) return 11 + Number(m[1]) * 2;
  if (l === "TGT") return 1000;
  if (l === "HB") return 1001;
  return null;
}

/** The shortcut the fixed block follows. */
export const FIXED_BLOCK_AFTER = "SC";

/**
 * The order the Shortcuts list started in: the order the chips used to appear
 * on the main running sheet (SC first, RACK last). Used once, to number
 * shortcuts that have never been placed.
 */
export const DEFAULT_SHORTCUT_ORDER = [
  "sc",
  "dso",
  "dr",
  "fp",
  "rp",
  "us",
  "de",
  "ar",
  "cp",
  "dw",
  "sp",
  "spv",
  "cv",
  "oos",
  "coos",
  "pu",
  "pt",
  "rack",
];

/**
 * Starting positions (1, 2, 3 …) for shortcuts that have never been placed:
 * the old chip order first, then anything else by trigger, A to Z.
 */
export function initialShortcutOrder(
  shortcuts: Array<{ id: number; trigger: string }>
): Array<{ id: number; sortOrder: number }> {
  const rank = (t: string) => {
    const i = DEFAULT_SHORTCUT_ORDER.indexOf(t.toLowerCase());
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...shortcuts]
    .sort(
      (a, b) =>
        rank(a.trigger) - rank(b.trigger) ||
        a.trigger.toLowerCase().localeCompare(b.trigger.toLowerCase())
    )
    .map((s, i) => ({ id: s.id, sortOrder: i + 1 }));
}

/**
 * Put chips in their fixed order.
 *
 * @param chips          every chip to show (target chips and shortcut chips)
 * @param shortcutOrder  every shortcut trigger, upper case, in Shortcuts-page
 *                       order (including ones hidden from the chips)
 */
export function orderRsChips<T extends { label: string }>(
  chips: T[],
  shortcutOrder: string[]
): T[] {
  const order = shortcutOrder.map(t => t.toUpperCase());
  const fixed = chips
    .filter(c => fixedChipRank(c.label) !== null)
    .sort((a, b) => fixedChipRank(a.label)! - fixedChipRank(b.label)!);
  const others = chips.filter(c => fixedChipRank(c.label) === null);
  const pos = (c: T) => {
    const i = order.indexOf(c.label.toUpperCase());
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = others
    .map((c, i) => ({ c, i }))
    .sort((a, b) => pos(a.c) - pos(b.c) || a.i - b.i)
    .map(x => x.c);
  // The fixed block goes straight after SC. If SC is not a shortcut at all
  // the block leads the row.
  const anchor = order.indexOf(FIXED_BLOCK_AFTER);
  if (anchor === -1) return [...fixed, ...sorted];
  const head = sorted.filter(c => pos(c) <= anchor);
  const tail = sorted.filter(c => pos(c) > anchor);
  return [...head, ...fixed, ...tail];
}
