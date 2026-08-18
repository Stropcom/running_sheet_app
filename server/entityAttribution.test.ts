/**
 * Tests for the entity attribution rule — an entity is only credited with an
 * observation it is actually mentioned in.
 *
 * The governing scenario (see entityAttribution.ts): a team sits on a house
 * believing the target is inside and never sees him. Other people leave that
 * house, in their own vehicles, and travel elsewhere; every movement is
 * logged on a sheet assigned to the target. None of it is his. Before this
 * rule, all of it was recorded against him — producing a full Pattern of
 * Life, Heat Map and association list for someone nobody laid eyes on.
 */

import { describe, it, expect } from "vitest";
import {
  attributedRowIds,
  type AttributableOccurrence,
} from "./entityAttribution";

const occ = (
  rowId: number,
  sheetId = 1,
  operationId = 10
): AttributableOccurrence => ({ rowId, sheetId, operationId });

describe("attributedRowIds — the watched-house scenario", () => {
  it("credits a target with nothing when they are never mentioned", () => {
    // The target has no observation occurrences at all: the shift produced
    // plenty of rows, but not one of them names him. Every one of those rows
    // belongs to somebody else.
    expect(attributedRowIds([], { operationId: 10 }).size).toBe(0);
    expect(attributedRowIds(undefined, { operationId: 10 }).size).toBe(0);
  });

  it("credits only the rows the target is mentioned in, not the whole sheet", () => {
    // Rows 1 and 7 name the target; rows 2-6 are the associates' movements
    // logged on the same sheet. Only 1 and 7 are his.
    const rowIds = attributedRowIds([occ(1), occ(7)], { operationId: 10 });
    expect(Array.from(rowIds).sort((a, b) => a - b)).toEqual([1, 7]);
  });
});

describe("attributedRowIds — registry cards are not sightings", () => {
  it("excludes rowId 0, the synthetic registry-card occurrence", () => {
    // A target's home address exists as an entity from the moment it's on the
    // card. That is not evidence anyone was ever seen there.
    const rowIds = attributedRowIds([occ(0), occ(0), occ(4)]);
    expect(Array.from(rowIds)).toEqual([4]);
  });

  it("returns empty when a target is known only from its registry card", () => {
    expect(attributedRowIds([occ(0)]).size).toBe(0);
  });
});

describe("attributedRowIds — scoping", () => {
  it("restricts to one operation when asked", () => {
    const rowIds = attributedRowIds(
      [occ(1, 1, 10), occ(2, 2, 20), occ(3, 3, 10)],
      { operationId: 10 }
    );
    expect(Array.from(rowIds).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("restricts to a set of sheets when asked", () => {
    const rowIds = attributedRowIds([occ(1, 1), occ(2, 2), occ(3, 3)], {
      sheetIds: new Set([1, 3]),
    });
    expect(Array.from(rowIds).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("applies operation and sheet scope together", () => {
    const rowIds = attributedRowIds(
      [occ(1, 1, 10), occ(2, 2, 10), occ(3, 3, 20)],
      { operationId: 10, sheetIds: new Set([2, 3]) }
    );
    expect(Array.from(rowIds)).toEqual([2]);
  });

  it("is app-wide when no scope is given", () => {
    const rowIds = attributedRowIds([occ(1, 1, 10), occ(2, 2, 20)]);
    expect(Array.from(rowIds).sort((a, b) => a - b)).toEqual([1, 2]);
  });
});

describe("attributedRowIds — mechanics", () => {
  it("deduplicates a row the entity is mentioned in more than once", () => {
    // Bracket introduction and a later bare re-mention in the same row must
    // not count as two observations.
    const rowIds = attributedRowIds([occ(5), occ(5), occ(5)]);
    expect(Array.from(rowIds)).toEqual([5]);
  });

  it("ignores negative row ids defensively", () => {
    expect(attributedRowIds([occ(-1)]).size).toBe(0);
  });
});
