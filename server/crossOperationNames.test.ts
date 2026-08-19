/**
 * Tests for crossOperationNames — the check backing the "already recorded
 * on another operation" alert. This is the deliberate opposite case of
 * findPossibleDuplicates (entityDedup.ts), which skips exact matches
 * because they already collapse into one shared entity via
 * getAllIntelligenceEntities' key normalization. That silent merge is
 * exactly what this check surfaces: the same address, vehicle, or person
 * already known from a real observation on a different operation.
 */

import { describe, it, expect } from "vitest";
import { crossOperationNames } from "./entityAttribution";

const occ = (
  operationId: number,
  operationName: string,
  rowId = 1
): { rowId: number; operationId: number; operationName: string } => ({
  rowId,
  operationId,
  operationName,
});

describe("crossOperationNames", () => {
  it("returns the other operation when the entity has a real sighting there", () => {
    const names = crossOperationNames(
      [occ(10, "TOLEDO"), occ(20, "SHANGRI-LA")],
      10
    );
    expect(names).toEqual(["SHANGRI-LA"]);
  });

  it("returns nothing when every occurrence is on the current operation", () => {
    const names = crossOperationNames(
      [occ(10, "TOLEDO"), occ(10, "TOLEDO")],
      10
    );
    expect(names).toEqual([]);
  });

  it("returns nothing for an entity with no occurrences at all", () => {
    expect(crossOperationNames([], 10)).toEqual([]);
    expect(crossOperationNames(undefined, 10)).toEqual([]);
  });

  it("ignores a registry-only (rowId 0) occurrence on another operation", () => {
    // A target's own registry card isn't a sighting anywhere — a synthetic
    // occurrence must never ground a cross-operation warning.
    const names = crossOperationNames([occ(20, "SHANGRI-LA", 0)], 10);
    expect(names).toEqual([]);
  });

  it("dedupes multiple rows on the same other operation into one name", () => {
    const names = crossOperationNames(
      [occ(20, "SHANGRI-LA"), occ(20, "SHANGRI-LA"), occ(20, "SHANGRI-LA")],
      10
    );
    expect(names).toEqual(["SHANGRI-LA"]);
  });

  it("lists multiple other operations, in first-seen order", () => {
    const names = crossOperationNames(
      [occ(30, "PALERMO"), occ(20, "SHANGRI-LA"), occ(30, "PALERMO")],
      10
    );
    expect(names).toEqual(["PALERMO", "SHANGRI-LA"]);
  });

  it("still excludes the current operation when it's mixed in with real cross-operation hits", () => {
    const names = crossOperationNames(
      [occ(10, "TOLEDO"), occ(20, "SHANGRI-LA"), occ(10, "TOLEDO")],
      10
    );
    expect(names).toEqual(["SHANGRI-LA"]);
  });
});
