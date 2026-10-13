/**
 * Order of the quick-insert chips on the main running sheet and in the RS
 * Quick Entry pop-up. One rule, shared by both screens:
 *
 *  - The shortcut chips follow the order of the Shortcuts page (an admin drags
 *    them into place there; it is saved on the server, so it is the same for
 *    everyone, on every sheet and device).
 *  - The chips that come from the target itself cannot be moved:
 *      · HBF, the vehicle pairs V1F/V1, V2F/V2… and TGT are one block straight
 *        after SC, in that fixed order;
 *      · HB sits straight after AR (so, in the default order, between AR and
 *        CP).
 *
 * Pure and deterministic so it can be tested without the screens.
 */

const VEHICLE_FULL = /^V(\d+)F$/;
const VEHICLE_SHORT = /^V(\d+)$/;

/** Fixed rank within the block after SC (lower = earlier), or null for any
 * other chip. HB is not in the block — see HB_AFTER. */
export function fixedChipRank(label: string): number | null {
  const l = label.toUpperCase();
  if (l === "HBF") return 0;
  let m = VEHICLE_FULL.exec(l);
  if (m) return 10 + Number(m[1]) * 2;
  m = VEHICLE_SHORT.exec(l);
  if (m) return 11 + Number(m[1]) * 2;
  if (l === "TGT") return 1000;
  return null;
}

/** The shortcut HB follows. */
export const HB_AFTER = "AR";

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
  const scAt = order.indexOf(FIXED_BLOCK_AFTER);
  const arAt = order.indexOf(HB_AFTER);
  // Everything is placed by a sort key on the Shortcuts-page scale: a shortcut
  // chip at its list position, the fixed block half a step after SC (or ahead
  // of everything when there is no SC), and HB half a step after AR (or just
  // after the fixed block when there is no AR). Ties keep the order given.
  const blockKey = scAt === -1 ? -1 : scAt + 0.5;
  const keyOf = (c: T): number => {
    const rank = fixedChipRank(c.label);
    if (rank !== null) return blockKey + rank * 1e-6;
    if (c.label.toUpperCase() === "HB")
      return arAt === -1 ? blockKey + 0.01 : arAt + 0.5;
    const i = order.indexOf(c.label.toUpperCase());
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return chips
    .map((c, i) => ({ c, i, k: keyOf(c) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map(x => x.c);
}
