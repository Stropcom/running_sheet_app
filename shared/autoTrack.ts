/**
 * When a Search switches Tracks on by itself.
 *
 * A Search turns on the Track (the trail drawn on this screen) of everyone who
 * is sharing their location on the operation — once. It never forces a Track to
 * stay on: whoever turns one off, from the Track button in the Teams panel or
 * in My Pill, keeps it off for the rest of that Search. A new Search turns them
 * on again. The pure rule lives here so it can be tested; the Map page only
 * applies what it says.
 */

export interface AutoTrackState {
  /** The Search these were switched on for ("" before any). */
  searchKey: string;
  /** Users already switched on for that Search — never switched on again by it. */
  done: number[];
  /** The Search whose automatic Tracks were all switched off from My Pill. */
  offForSearchKey: string;
}

export const NO_AUTO_TRACK: AutoTrackState = {
  searchKey: "",
  done: [],
  offForSearchKey: "",
};

/**
 * @param liveIds     users sharing their location right now on the operation(s)
 *                    this screen shows (a device with its location off is not
 *                    in the list, so it is never tracked)
 * @param searchKey   the running Search's key, or null when none is shown
 */
export function autoTrackStep(
  state: AutoTrackState,
  searchKey: string | null,
  liveIds: readonly number[]
): { next: AutoTrackState; add: number[] } {
  if (!searchKey) return { next: state, add: [] };
  const sameSearch = state.searchKey === searchKey;
  const done = sameSearch ? state.done : [];
  const offForSearchKey = sameSearch ? state.offForSearchKey : "";
  // Everyone's Track was switched off here: this Search switches no more on.
  if (offForSearchKey === searchKey)
    return { next: { searchKey, done, offForSearchKey }, add: [] };
  const add = Array.from(new Set(liveIds)).filter(id => !done.includes(id));
  return {
    next: { searchKey, done: [...done, ...add], offForSearchKey },
    add,
  };
}

/** Everyone's Track was switched off from My Pill during this Search. */
export function autoTrackAllOff(
  state: AutoTrackState,
  searchKey: string | null
): AutoTrackState {
  return searchKey
    ? { ...state, searchKey, offForSearchKey: searchKey }
    : state;
}
