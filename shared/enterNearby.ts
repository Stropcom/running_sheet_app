/**
 * "Entered here" from a map click. A person logged inside a place with many
 * parts — a shopping centre, a market, a hospital — often goes from there into
 * one shop. When the officer clicks a place on the map for an RS Quick Entry,
 * and someone is logged inside somewhere close to it that is NOT the place
 * clicked, the entry offers "<names> entered <clicked place> and continued out
 * of sight." The click is the trigger: nothing is offered on the cards
 * otherwise, so a target inside a house never gets an extra button.
 *
 * The sentence is written like any other first mention of a place — the full
 * address with its bracket short form the first time (which is what puts a pin
 * and the target flag on the shop), the short form after that. The centre he
 * was logged entering stays logged: nobody exited it, so Walked to Vehicle and
 * Left address on the centre's own cards keep working.
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
  /** The place they were last logged entering — shown on the card. */
  inside: string;
  /** The row that put them there. */
  rowId: number;
  /** How far the clicked place is from where they are, in metres. */
  metres: number;
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
  const out: EnterOffer[] = [];
  const done = new Set<string>();
  for (const w of walkIns) {
    if (done.has(key(w.names))) continue;
    done.add(key(w.names));
    const mine = walkIns.filter(g => key(g.names) === key(w.names));
    // Already inside the place clicked (or something that holds it).
    const insideClicked = mine.some(
      g =>
        same(g.location, clickedAddress) &&
        wordCount(clickedAddress) <= wordCount(g.location)
    );
    if (insideClicked) continue;
    // Where they were last logged going in — the newest row.
    const latest = mine.reduce((a, b) => (b.rowId > a.rowId ? b : a));
    if (input.exclude?.(latest.location)) continue;
    const at = positionOf(latest.location);
    if (!at) continue;
    const metres = distanceMetres(at.lat, at.lng, clicked.lat, clicked.lng);
    if (metres > ENTER_NEARBY_METRES) continue;
    out.push({
      names: w.names,
      inside: latest.location,
      rowId: latest.rowId,
      metres,
    });
  }
  return out;
}
