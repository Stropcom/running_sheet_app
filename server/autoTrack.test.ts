import { describe, expect, it } from "vitest";
import {
  NO_AUTO_TRACK,
  autoTrackAllOff,
  autoTrackStep,
} from "@shared/autoTrack";

describe("a Search switching Tracks on by itself", () => {
  it("switches on everyone sharing their location, once", () => {
    const first = autoTrackStep(NO_AUTO_TRACK, "s1", [1, 2, 2]);
    expect(first.add).toEqual([1, 2]);
    // The same people again: nothing more to switch on.
    expect(autoTrackStep(first.next, "s1", [1, 2]).add).toEqual([]);
  });

  it("does not switch a Track back on after someone switched it off", () => {
    const first = autoTrackStep(NO_AUTO_TRACK, "s1", [1, 2]);
    // User 2 turned theirs off by hand; the list is polled again and again.
    let state = first.next;
    for (let i = 0; i < 3; i++) {
      const step = autoTrackStep(state, "s1", [1, 2]);
      expect(step.add).toEqual([]);
      state = step.next;
    }
  });

  it("switches on someone who starts sharing later in the same Search", () => {
    const first = autoTrackStep(NO_AUTO_TRACK, "s1", [1]);
    expect(autoTrackStep(first.next, "s1", [1, 3]).add).toEqual([3]);
  });

  it("does nothing for a device that is not sharing (it is not in the list)", () => {
    expect(autoTrackStep(NO_AUTO_TRACK, "s1", []).add).toEqual([]);
  });

  it("does nothing while no Search is shown", () => {
    const step = autoTrackStep(NO_AUTO_TRACK, null, [1, 2]);
    expect(step.add).toEqual([]);
    expect(step.next).toEqual(NO_AUTO_TRACK);
  });

  it("switches them on again for a new Search", () => {
    const first = autoTrackStep(NO_AUTO_TRACK, "s1", [1, 2]);
    expect(autoTrackStep(first.next, "s2", [1, 2]).add).toEqual([1, 2]);
  });

  it("stops for the rest of that Search once all are switched off in My Pill", () => {
    const first = autoTrackStep(NO_AUTO_TRACK, "s1", [1, 2]);
    const off = autoTrackAllOff(first.next, "s1");
    // A newcomer is not switched on either — the officer said no Tracks.
    expect(autoTrackStep(off, "s1", [1, 2, 3]).add).toEqual([]);
    // But the next Search switches them on again.
    expect(autoTrackStep(off, "s2", [1, 2, 3]).add).toEqual([1, 2, 3]);
  });
});
