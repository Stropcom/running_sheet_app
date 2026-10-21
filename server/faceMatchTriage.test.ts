import { describe, expect, it } from "vitest";
import {
  HIGH_CONFLICT_SIMILARITY,
  autoDecision,
  identityKey,
  triageMatches,
  type TriageCandidate,
} from "../shared/faceMatchTriage";

const c = (
  id: number,
  category: string,
  targetId: number | null,
  label: string,
  similarity: number
): TriageCandidate => ({
  entityLinkId: id,
  category,
  targetId,
  entityLabel: label,
  similarity,
});

// The four matches from the screenshots: three photos of the target DOYLE and
// one of the associate PIKE.
const DOYLE_A = c(1, "target", 7, "Kieran Patrick DOYLE", 0.64);
const DOYLE_B = c(2, "target", 7, "Kieran Patrick DOYLE", 0.54);
const DOYLE_C = c(3, "target", 7, "Kieran Patrick DOYLE", 0.49);
const PIKE = c(4, "associate", null, "Noah Benjamin PIKE", 0.36);
const ALL = [DOYLE_A, DOYLE_B, DOYLE_C, PIKE];

describe("who is the same identity", () => {
  it("a target is its id, an associate its name, an unidentified person itself", () => {
    expect(identityKey(DOYLE_A)).toBe(identityKey(DOYLE_B));
    expect(identityKey(PIKE)).toBe("associate:noah benjamin pike");
    expect(identityKey(c(9, "unidentified_person", null, "UM1", 0.5), 9)).toBe(
      "unidentified:9"
    );
  });
});

describe("once the photo is confirmed as DOYLE", () => {
  it("his other photos are not asked, and PIKE (36%) is not asked either", () => {
    const r = triageMatches(
      ALL,
      { 1: "same" },
      {
        category: "target",
        targetId: 7,
        entityLabel: "Kieran Patrick DOYLE",
      }
    );
    expect(r.ask).toEqual([]);
    expect(r.same.map(x => x.entityLinkId)).toEqual([1, 2, 3]);
    expect(r.dismiss.map(x => x.entityLinkId)).toEqual([4]);
  });

  it("picking DOYLE in the list is enough, with no answer given", () => {
    const r = triageMatches(ALL, {}, { category: "target", targetId: 7 });
    expect(r.ask).toEqual([]);
  });

  it("a very close match under another name is still asked about", () => {
    const close = c(5, "associate", null, "Noah Benjamin PIKE", 0.54);
    const r = triageMatches(
      [DOYLE_A, close],
      { 1: "same" },
      {
        category: "target",
        targetId: 7,
      }
    );
    expect(r.ask).toEqual([close]);
    expect(HIGH_CONFLICT_SIMILARITY).toBe(0.5);
    expect(
      autoDecision(c(6, "associate", null, "X", 0.5), { "target:7": "same" })
    ).toBeNull();
    expect(
      autoDecision(c(6, "associate", null, "X", 0.49), { "target:7": "same" })
    ).toBe("different");
  });

  it("an Unidentified Person entry is still asked about", () => {
    const u = c(8, "unidentified_person", null, "Unidentified Person 3", 0.5);
    const r = triageMatches(
      [DOYLE_A, u],
      {},
      { category: "target", targetId: 7 }
    );
    expect(r.ask).toEqual([u]);
  });
});

describe("once a person is answered 'different'", () => {
  it("their other photos are not asked again", () => {
    const r = triageMatches(ALL, { 4: "different" }, null);
    expect(r.dismiss.map(x => x.entityLinkId)).toEqual([4]);
    expect(r.ask.map(x => x.entityLinkId)).toEqual([1, 2, 3]);
    const twoPike = [
      PIKE,
      c(5, "associate", null, "Noah Benjamin PIKE", 0.5),
      DOYLE_A,
    ];
    const r2 = triageMatches(twoPike, { 4: "different" }, null);
    expect(r2.dismiss.map(x => x.entityLinkId)).toEqual([4, 5]);
    expect(r2.ask).toEqual([DOYLE_A]);
  });
});

describe("nothing answered, nothing chosen", () => {
  it("everything is asked", () => {
    expect(triageMatches(ALL, {}, null).ask).toEqual(ALL);
  });

  it("a 'same' answer on someone other than the chosen person doesn't count", () => {
    const r = triageMatches(
      ALL,
      { 1: "same" },
      { category: "associate", entityLabel: "Noah Benjamin PIKE" }
    );
    expect(r.ask.map(x => x.entityLinkId)).toContain(1);
  });
});
