import { describe, expect, it } from "vitest";
import { pickProfilePhoto } from "../shared/profilePhoto";

const p = (id: number, day: number, fromRegistry = false) => ({
  id,
  fromRegistry,
  createdAt: new Date(2026, 0, day),
});

describe("pickProfilePhoto", () => {
  it("returns null for no photos", () => {
    expect(pickProfilePhoto([])).toBeNull();
    expect(pickProfilePhoto(undefined)).toBeNull();
  });

  it("with no registry photo, picks the first one uploaded (not the latest)", () => {
    expect(pickProfilePhoto([p(3, 20), p(1, 5), p(2, 12)])?.id).toBe(1);
  });

  it("a registry photo beats earlier and later uploads", () => {
    expect(pickProfilePhoto([p(3, 20), p(1, 5), p(2, 12, true)])?.id).toBe(2);
    expect(pickProfilePhoto([p(1, 5), p(2, 12, true), p(3, 20)])?.id).toBe(2);
  });

  it("a registry photo uploaded later takes priority over an earlier first photo", () => {
    const before = [p(1, 5)];
    expect(pickProfilePhoto(before)?.id).toBe(1);
    expect(pickProfilePhoto([...before, p(9, 30, true)])?.id).toBe(9);
  });

  it("several registry photos: the most recent registry one wins", () => {
    expect(pickProfilePhoto([p(1, 5, true), p(2, 10, true), p(3, 1)])?.id).toBe(
      2
    );
  });

  it("copes with string timestamps and missing flags", () => {
    expect(
      pickProfilePhoto([
        { id: 2, createdAt: "2026-02-02T00:00:00Z" },
        { id: 1, createdAt: "2026-01-01T00:00:00Z" },
      ])?.id
    ).toBe(1);
  });
});
