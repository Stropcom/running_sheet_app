// A vehicle that has a marker on the map is where its marker is. Officers drop
// a marker labelled with the rego ("1FAC488") on the vehicle and log from it,
// so the marker, not the last place someone was written down, says where the
// vehicle — and anyone logged in it — is.

export interface VehicleMarkerRef {
  id: number;
  lat: number;
  lng: number;
  /** The marker's address as stored, e.g. "170 The Esplanade, SCARBOROUGH WA
   * (170 The Esplanade)". */
  address: string | null;
}

interface MarkerLike {
  id: number;
  label: string | null;
  lat: number;
  lng: number;
  address: string | null;
  operationId: number | null;
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The marker that stands for vehicle `rego`: one whose label holds the rego
 * (case, spaces and punctuation ignored). A marker of the sheet's own
 * operation wins over one with no operation; markers of other operations are
 * never used. Newest first among equals (markers arrive newest first). */
export function findVehicleMarker(
  markers: MarkerLike[],
  rego: string,
  operationId: number | null
): VehicleMarkerRef | null {
  const want = squash(rego);
  if (want.length < 5) return null;
  const hits = markers.filter(
    m =>
      !!m.label &&
      squash(m.label).includes(want) &&
      (m.operationId == null ||
        operationId == null ||
        m.operationId === operationId)
  );
  if (hits.length === 0) return null;
  const best =
    hits.find(m => operationId != null && m.operationId === operationId) ??
    hits[0];
  return {
    id: best.id,
    lat: best.lat,
    lng: best.lng,
    address: best.address ?? null,
  };
}

/** Each placement in a vehicle, with that vehicle's marker when it has one. */
export function attachVehicleMarkers<P extends { rego: string }>(
  placements: P[],
  markers: MarkerLike[],
  operationId: number | null
): (P & { vehicleMarker?: VehicleMarkerRef })[] {
  const cache = new Map<string, VehicleMarkerRef | null>();
  return placements.map(p => {
    if (!p.rego) return p;
    const k = p.rego.toUpperCase();
    if (!cache.has(k)) cache.set(k, findVehicleMarker(markers, k, operationId));
    const vehicleMarker = cache.get(k);
    return vehicleMarker ? { ...p, vehicleMarker } : p;
  });
}
