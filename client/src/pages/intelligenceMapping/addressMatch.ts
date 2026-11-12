import { transitFullAddress, type TransitPlace } from "@shared/transitPlace";
import { samePlace } from "@shared/targetPosition";
import { buildPoiAddress, expandStreetType } from "@/lib/addressFormat";

// RS Quick Entry's continuity chips (vehicle departing/walked in/walked
// out) match a pending arrival/walk-in's own stored address against
// wherever the popup is currently open, to decide whether that vehicle/
// walk-in is "here". A pending arrival's address comes from the row text
// as written (an officer typically abbreviates the street type, "4
// Wheatcroft St"), while the popup's own current-location address comes
// from Google's full formatted address via convertGoogleAddresses, which
// never abbreviates ("4 Wheatcroft Street") — a real, reported bug: the
// exact-string match silently failed and hid every continuity chip for an
// address whose street type happened to differ only by abbreviation.
// expandStreetType canonicalises both sides to the same full form before
// comparing, same as any other "same real place, different spelling"
// address comparison in this file.
/** The Quick Entry / marker address for a tapped place: a bus stop or train
 * station is "<label>, SUBURB WA (<label>)" (it has no street number);
 * anything else is the usual business wording. */
export function poiAddressOf(poi: {
  name: string;
  address: string;
  transit?: TransitPlace;
}): string {
  if (poi.transit) {
    const full = transitFullAddress(poi.name, poi.address);
    if (full) return full;
  }
  return buildPoiAddress(poi.name, poi.address);
}

export function addressesMatch(a: string, b: string): boolean {
  return (
    expandStreetType(a.trim()).toLowerCase() ===
    expandStreetType(b.trim()).toLowerCase()
  );
}

// Tracker cards in the RS Quick Entry popup: the same place however it was
// typed — street addresses by abbreviation, businesses/POIs by name.
export function cardAddressMatch(a: string, b: string): boolean {
  return addressesMatch(a, b) || samePlace(a, b);
}
