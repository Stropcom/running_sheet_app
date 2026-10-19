import { describe, expect, it } from "vitest";
import {
  resolvePhotoLink,
  type SavedEntityLabels,
} from "@shared/entityPhotoSlots";

const saved: SavedEntityLabels = {
  name: "Karim Elias NAJJAR, born 02 May 1985 (NAJJAR)",
  hbf: "27 Olding Way, MELVILLE WA (27 Olding Way)",
  v1f: "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)",
  extraAddresses: [
    { id: "a1", full: "5 Smith Street, FREMANTLE WA (5 Smith Street)" },
    { id: "a2", full: "" },
  ],
  extraVehicles: [{ id: "v1", full: "black Ford Ranger (Vehicle 1ABC123)" }],
};

describe("resolvePhotoLink", () => {
  it("links the name slot to the person", () => {
    expect(resolvePhotoLink("name", saved)).toEqual({
      kind: "person",
      label: saved.name,
    });
  });

  it("links an address or vehicle by its own saved label", () => {
    expect(resolvePhotoLink("address", saved)).toEqual({
      kind: "location",
      label: saved.hbf,
    });
    expect(resolvePhotoLink("vehicle", saved)).toEqual({
      kind: "vehicle",
      label: saved.v1f,
    });
    expect(resolvePhotoLink("xa:a1", saved)).toEqual({
      kind: "location",
      label: "5 Smith Street, FREMANTLE WA (5 Smith Street)",
    });
    expect(resolvePhotoLink("xv:v1", saved)).toEqual({
      kind: "vehicle",
      label: "black Ford Ranger (Vehicle 1ABC123)",
    });
  });

  it("falls back to the person when the entry ended up with no label", () => {
    expect(resolvePhotoLink("xa:a2", saved)).toEqual({
      kind: "person",
      label: saved.name,
    });
    expect(resolvePhotoLink("vehicle", { ...saved, v1f: null })).toEqual({
      kind: "person",
      label: saved.name,
    });
  });

  it("is null for an unknown slot, or when there is nothing to link to", () => {
    expect(resolvePhotoLink("other", saved)).toBeNull();
    expect(resolvePhotoLink("name", { ...saved, name: "  " })).toBeNull();
    expect(
      resolvePhotoLink("address", { ...saved, name: null, hbf: null })
    ).toBeNull();
  });
});
