/**
 * Tests for mergeContainedEntities — the pass that collapses a registry
 * card's address/vehicle entity into an observation-derived mention of the
 * same real-world thing, or vice versa.
 *
 * The regression this guards: once registry addresses are tidied for
 * display (see 17e2229 in ops history), a registry entity and a text-mined
 * entity for the same address routinely format to the *identical* label —
 * e.g. both render as "81 Redmond Road, HAMILTON HILL". The merge used to
 * track which entities had been "absorbed" by lowercase shortForm string
 * rather than by which entity object got absorbed. When two different
 * entities shared that string, marking the absorbed one poisoned the
 * survivor's own lookup too, and the whole merged entity — registry
 * occurrence and every real observation row alike — silently vanished from
 * the output. That happened on RS 459: 81 Redmond Road disappeared from the
 * Ego Network and every Target Profile, because CAT's registered home
 * address collided with the sheet's own text-mined mentions of the same
 * street.
 */

import { describe, it, expect } from "vitest";
import { mergeContainedEntities, type IntelligenceEntity } from "./db";

const occ = (
  rowId: number,
  observationSnippet = `row ${rowId}`
): IntelligenceEntity["occurrences"][0] => ({
  sheetId: 18,
  sheetTitle: "RS 459",
  operationId: 1,
  operationName: "TOLEDO",
  rowId,
  observationSnippet,
  timeMinutes: null,
  fullDescription: observationSnippet,
});

const entity = (
  shortForm: string,
  occurrences: IntelligenceEntity["occurrences"]
): IntelligenceEntity => ({ shortForm, type: "address", occurrences });

describe("mergeContainedEntities — the identical-label collision (RS 459 regression)", () => {
  it("keeps the merged survivor when a registry entity and a text-mined entity format to the exact same label", () => {
    // CAT's registered hbf, after formatIntelAddress, and the address as
    // mined from observation text both render as this same string.
    const registryCard = entity("81 Redmond Road, HAMILTON HILL", [
      occ(0, "Target card"),
    ]);
    const textMined = entity("81 Redmond Road, HAMILTON HILL", [
      occ(292, "Surveillance commenced..."),
      occ(
        308,
        "Ruben SANDWICH (SANDWICH) and CAT walked from 81 Redmond Road..."
      ),
      occ(310, "SANDWICH and CAT walked back towards the front door..."),
    ]);

    // Registry cards are built before observation rows are scanned, so the
    // registry entity is first in insertion order — reproduce that order.
    const survivors = mergeContainedEntities(
      [registryCard, textMined],
      "address"
    );

    expect(survivors).toHaveLength(1);
    const rowIds = survivors[0].occurrences
      .map(o => o.rowId)
      .sort((a, b) => a - b);
    expect(rowIds).toEqual([0, 292, 308, 310]);
  });

  it("keeps the survivor regardless of which entity is inserted first", () => {
    const registryCard = entity("81 Redmond Road, HAMILTON HILL", [occ(0)]);
    const textMined = entity("81 Redmond Road, HAMILTON HILL", [occ(308)]);

    const survivors = mergeContainedEntities(
      [textMined, registryCard],
      "address"
    );

    expect(survivors).toHaveLength(1);
    expect(survivors[0].occurrences.map(o => o.rowId).sort()).toEqual([0, 308]);
  });

  it("still merges when one label is a genuine prefix of the other, keeping the longer as the label", () => {
    const shortRegistry = entity("1 Smith Street", [occ(0)]);
    const fullTextMined = entity("1 Smith Street, FREMANTLE", [occ(50)]);

    const survivors = mergeContainedEntities(
      [shortRegistry, fullTextMined],
      "address"
    );

    expect(survivors).toHaveLength(1);
    expect(survivors[0].shortForm).toBe("1 Smith Street, FREMANTLE");
    expect(survivors[0].occurrences.map(o => o.rowId).sort()).toEqual([0, 50]);
  });

  it("does not merge two unrelated addresses that merely share a common word", () => {
    const a = entity("1 Smith Street, FREMANTLE", [occ(1)]);
    const b = entity("2 Smith Street, FREMANTLE", [occ(2)]);

    const survivors = mergeContainedEntities([a, b], "address");

    expect(survivors).toHaveLength(2);
  });

  it("dedupes occurrences shared between the two sources instead of double-counting", () => {
    const registryCard = entity("81 Redmond Road, HAMILTON HILL", [
      occ(0, "Target card"),
    ]);
    const textMined = entity("81 Redmond Road, HAMILTON HILL", [
      occ(0, "Target card"), // identical occurrence somehow present on both
      occ(308),
    ]);

    const survivors = mergeContainedEntities(
      [registryCard, textMined],
      "address"
    );

    expect(survivors).toHaveLength(1);
    expect(survivors[0].occurrences).toHaveLength(2);
  });

  it("still absorbs a bare vehicle rego into a fuller description, and vice versa when the fuller one is shorter", () => {
    const bareRego = entity("1ADF124", [occ(1)]);
    const fullDesc = entity("1ADF124 red Ford Territory", [occ(2)]);
    (bareRego as IntelligenceEntity).type = "vehicle";
    (fullDesc as IntelligenceEntity).type = "vehicle";

    const survivors = mergeContainedEntities([bareRego, fullDesc], "vehicle");
    expect(survivors).toHaveLength(1);
    expect(survivors[0].shortForm).toBe("1ADF124 red Ford Territory");
  });
});
