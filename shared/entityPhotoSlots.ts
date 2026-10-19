// Photos added from inside an entity's EDIT form on the Target Registry card
// (the same "Upload Image" offer Add Target gives each person, address and
// vehicle). The photo is chosen while editing but only uploaded and linked once
// the edit is saved, because the label it links by is the composed full
// address / vehicle / name as saved — an edit can change that label, and a
// brand-new entry has none until then. A "slot" names the entity the photo was
// picked for.

export type PhotoSlot =
  | "name"
  | "address"
  | "vehicle"
  | `xa:${string}`
  | `xv:${string}`;

export interface SavedEntityLabels {
  /** The entity the whole card is about (target name / associate name). */
  name: string | null;
  hbf: string | null;
  v1f: string | null;
  extraAddresses: { id: string; full?: string | null }[];
  extraVehicles: { id: string; full?: string | null }[];
}

export type PhotoLink =
  | { kind: "location" | "vehicle"; label: string }
  | { kind: "person"; label: string };

/**
 * What a photo staged for `slot` should be linked to once saved. An address or
 * vehicle links by its own full label (so the Location / Vehicle profile
 * shows it); the name slot links to the person. An address or vehicle that
 * ended up with no label (cleared before saving) falls back to the person so
 * the photo isn't lost. Null when there is nothing to link to at all.
 */
export function resolvePhotoLink(
  slot: string,
  saved: SavedEntityLabels
): PhotoLink | null {
  const person = saved.name?.trim()
    ? ({ kind: "person", label: saved.name.trim() } as const)
    : null;
  const pick = (
    kind: "location" | "vehicle",
    label: string | null | undefined
  ): PhotoLink | null =>
    label && label.trim() ? { kind, label: label.trim() } : person;
  if (slot === "name") return person;
  if (slot === "address") return pick("location", saved.hbf);
  if (slot === "vehicle") return pick("vehicle", saved.v1f);
  if (slot.startsWith("xa:")) {
    const id = slot.slice(3);
    return pick("location", saved.extraAddresses.find(a => a.id === id)?.full);
  }
  if (slot.startsWith("xv:")) {
    const id = slot.slice(3);
    return pick("vehicle", saved.extraVehicles.find(v => v.id === id)?.full);
  }
  return null;
}
