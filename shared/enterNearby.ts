/**
 * "Entered here" from a map click. A person logged inside a place with many
 * parts — a shopping centre, a market, a hospital — often goes from there into
 * one shop. When the officer clicks a place on the map for an RS Quick Entry,
 * and someone is logged inside somewhere close to it that is NOT the place
 * clicked, the entry offers "<names> entered <clicked place>, <where they
 * are> and continued out of sight." The click is the trigger: nothing is
 * offered on the cards otherwise, so a target inside a house never gets an
 * extra button.
 *
 * Naming the place they are already inside in the sentence keeps them there
 * for the logger ("Rockingham Centre" is contained in "Woolworths Rockingham,
 * Rockingham Centre"), so Walked to Vehicle and Left address carry on working,
 * and the target flag moves to the shop (or stays on the centre's pin when the
 * shop has none).
 */
import { distanceMetres } from "./nearbyLocations";

/** How close the clicked place must be to where they are logged inside. A
 * large centre is a few hundred metres across. */
export const ENTER_NEARBY_METRES = 400;

export interface InsideEntry {
  names: string;
  location: string;
  rowId: number;
}

export interface EnterOffer {
  /** The person (or people) inside. */
  names: string;
  /** The place they are logged inside — the outermost one of theirs. */
  parent: string;
  /** The row that put them there. */
  rowId: number;
  /** How far the clicked place is from where they are, in metres. */
  metres: number;
  /** The sentence: "<names> entered <clicked>, <parent> and continued out of sight." */
  clickedLabel: string;
}

const wordCount = (s: string): number =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * Who could be taken into the clicked place. `same` is the app's place match
 * (a word-subset or address match); `positionOf` finds a place on the map.
 * A person with no position for where they are, or no position for the click,
 * is never offered anything — it errs towards no button.
 */
export function enterNearbyOffers(input: {
  walkIns: InsideEntry[];
  clicked: { lat: number; lng: number } | null;
  clickedAddress: string;
  same: (a: string, b: string) => boolean;
  positionOf: (place: string) => { lat: number; lng: number } | null;
  /** A place that is never offered from (the target's own home address). */
  exclude?: (place: string) => boolean;
}): EnterOffer[] {
  const { walkIns, clicked, clickedAddress, same, positionOf } = input;
  if (!clicked || !clickedAddress.trim()) return [];
  const key = (s: string) => s.trim().toLowerCase();
  const seen = new Set<string>();
  const out: EnterOffer[] = [];
  for (const w of walkIns) {
    // The outermost place of theirs that contains this one: inside the shop
    // and the centre, the centre is where they entered from.
    const group = walkIns.filter(
      g => key(g.names) === key(w.names) && same(g.location, w.location)
    );
    const outer = group.reduce((a, b) =>
      wordCount(b.location) < wordCount(a.location) ? b : a
    );
    const id = `${key(w.names)}|${key(outer.location)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (input.exclude?.(outer.location)) continue;
    // Already inside the place clicked (or something that holds it).
    const insideClicked = walkIns.some(
      g =>
        key(g.names) === key(w.names) &&
        same(g.location, clickedAddress) &&
        wordCount(clickedAddress) <= wordCount(g.location)
    );
    if (insideClicked) continue;
    const at = positionOf(outer.location);
    if (!at) continue;
    const metres = distanceMetres(at.lat, at.lng, clicked.lat, clicked.lng);
    if (metres > ENTER_NEARBY_METRES) continue;
    // Name the place they are in only when the clicked label doesn't already.
    const names = same(outer.location, clickedAddress)
      ? clickedAddress
      : `${clickedAddress}, ${outer.location}`;
    out.push({
      names: w.names,
      parent: outer.location,
      rowId: outer.rowId,
      metres,
      clickedLabel: names,
    });
  }
  return out;
}
