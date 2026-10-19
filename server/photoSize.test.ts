import { describe, expect, it } from "vitest";
import {
  PHOTO_ABSOLUTE_MAX_WIDTH,
  PHOTO_MIN_WIDTH,
  clampPhotoWidth,
  parseStoredPhotoWidth,
  photoWidthKey,
} from "@shared/photoSize";

describe("clampPhotoWidth", () => {
  it("keeps a sensible width as it is", () => {
    expect(clampPhotoWidth(300, 800)).toBe(300);
  });
  it("never goes below a thumbnail", () => {
    expect(clampPhotoWidth(10, 800)).toBe(PHOTO_MIN_WIDTH);
    expect(clampPhotoWidth(-50, 800)).toBe(PHOTO_MIN_WIDTH);
  });
  it("never goes wider than the row", () => {
    expect(clampPhotoWidth(700, 400)).toBe(400);
  });
  it("never goes past the absolute cap, however wide the row", () => {
    expect(clampPhotoWidth(5000, 4000)).toBe(PHOTO_ABSOLUTE_MAX_WIDTH);
  });
  it("a row narrower than a thumbnail still gives the minimum", () => {
    expect(clampPhotoWidth(200, 60)).toBe(PHOTO_MIN_WIDTH);
  });
  it("an unknown row width falls back to the cap, junk input to the minimum", () => {
    expect(clampPhotoWidth(500, 0)).toBe(500);
    expect(clampPhotoWidth(NaN, 800)).toBe(PHOTO_MIN_WIDTH);
  });
});

describe("parseStoredPhotoWidth", () => {
  it("reads a good stored value", () => {
    expect(parseStoredPhotoWidth("320")).toBe(320);
    expect(parseStoredPhotoWidth("320.4")).toBe(320);
  });
  it("ignores nothing, junk and out-of-range values", () => {
    expect(parseStoredPhotoWidth(null)).toBeNull();
    expect(parseStoredPhotoWidth("")).toBeNull();
    expect(parseStoredPhotoWidth("big")).toBeNull();
    expect(parseStoredPhotoWidth("12")).toBeNull();
    expect(parseStoredPhotoWidth("99999")).toBeNull();
  });
  it("is stored per photo", () => {
    expect(photoWidthKey(7)).toBe("runlog_photo_w_7");
  });
});
