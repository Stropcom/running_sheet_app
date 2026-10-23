import { describe, expect, it } from "vitest";
import {
  ITEM_DESCRIPTION_MAX,
  ITEM_LINK_CATEGORY,
  isAttachmentProperlyLinked,
  itemDescriptionProblem,
  normalizeItemDescription,
} from "../shared/attachmentLinking";

describe("normalizeItemDescription", () => {
  it("trims and makes runs of spaces and new lines one space", () => {
    expect(normalizeItemDescription("  black   backpack\n with strap ")).toBe(
      "black backpack with strap"
    );
  });
  it("copes with nothing", () => {
    expect(normalizeItemDescription("")).toBe("");
    expect(normalizeItemDescription(undefined as unknown as string)).toBe("");
  });
});

describe("itemDescriptionProblem", () => {
  it("asks for a description when there is none", () => {
    expect(itemDescriptionProblem("")).toMatch(/describe/i);
    expect(itemDescriptionProblem("   \n  ")).toMatch(/describe/i);
  });
  it("accepts a short description and the longest allowed", () => {
    expect(itemDescriptionProblem("black backpack")).toBeNull();
    expect(itemDescriptionProblem("x".repeat(ITEM_DESCRIPTION_MAX))).toBeNull();
  });
  it("refuses one that is too long, measured after tidying", () => {
    expect(
      itemDescriptionProblem("x".repeat(ITEM_DESCRIPTION_MAX + 1))
    ).toMatch(/300/);
    // Extra spaces don't count against the limit.
    expect(itemDescriptionProblem("  " + "x ".repeat(100) + "   ")).toBeNull();
  });
});

describe("an item link and the Governance 'properly linked' rule", () => {
  const item = { linkedCount: 1, linkedCategories: [ITEM_LINK_CATEGORY] };
  it("counts as linked for a photo with no face and no row", () => {
    expect(isAttachmentProperlyLinked({ ...item, faceCount: 0 })).toBe(true);
    expect(isAttachmentProperlyLinked({ ...item, faceCount: null })).toBe(true);
  });
  it("still needs the CIN link when the photo is on a row", () => {
    expect(isAttachmentProperlyLinked({ ...item, rowId: 5 })).toBe(false);
    expect(
      isAttachmentProperlyLinked({
        linkedCount: 2,
        linkedCategories: [ITEM_LINK_CATEGORY, "member"],
        rowId: 5,
      })
    ).toBe(true);
  });
  it("does not satisfy the person rule for a photo with a face", () => {
    expect(isAttachmentProperlyLinked({ ...item, faceCount: 1 })).toBe(false);
    expect(
      isAttachmentProperlyLinked({
        linkedCount: 2,
        linkedCategories: [ITEM_LINK_CATEGORY, "target"],
        faceCount: 1,
      })
    ).toBe(true);
  });
  it("a photo with no link at all is still not linked", () => {
    expect(isAttachmentProperlyLinked({ linkedCount: 0 })).toBe(false);
  });
});
