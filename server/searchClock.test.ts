import { describe, expect, it } from "vitest";
import {
  RING_REFRESH_MS,
  SEEN_AGO_MINUTES,
  msFromPerthMinutes,
  searchElapsed,
  seenAgo,
} from "../shared/searchClock";
import { perthClock } from "../shared/targetPredictor";

describe("Search clock: the rings run to the second", () => {
  const t0 = Date.parse("2026-10-26T10:00:00+08:00");

  it("redraws every 15 seconds", () => {
    expect(RING_REFRESH_MS).toBe(15_000);
  });

  it("'Now' starts at nothing and grows by the second", () => {
    expect(searchElapsed(t0, null, t0).elapsedMinutes).toBe(0);
    expect(searchElapsed(t0, null, t0 + 15_000).elapsedMinutes).toBeCloseTo(
      0.25
    );
    expect(searchElapsed(t0, null, t0 + 60_000).elapsedMinutes).toBe(1);
  });

  it("'2 min' starts two minutes in, 'Now' is 0, and nothing goes back past 5", () => {
    expect(SEEN_AGO_MINUTES).toEqual([0, 1, 2, 3, 5]);
    expect(searchElapsed(seenAgo(2, t0), null, t0).elapsedMinutes).toBeCloseTo(
      2
    );
    expect(searchElapsed(seenAgo(0, t0), null, t0).elapsedMinutes).toBe(0);
  });

  it("a pause holds the clock at the moment it was paused", () => {
    const seen = t0;
    const paused = t0 + 90_000;
    const a = searchElapsed(seen, paused, t0 + 120_000);
    expect(a.paused).toBe(true);
    expect(a.elapsedMinutes).toBeCloseTo(1.5);
    // Later, still held.
    expect(
      searchElapsed(seen, paused, t0 + 600_000).elapsedMinutes
    ).toBeCloseTo(1.5);
    // Resumed: straight back to the real time since he was seen.
    expect(searchElapsed(seen, null, t0 + 600_000).elapsedMinutes).toBeCloseTo(
      10
    );
  });

  it("a pause that is out of range is trimmed, never negative", () => {
    // Paused before he was seen: nothing has elapsed.
    expect(searchElapsed(t0, t0 - 5_000, t0 + 60_000).elapsedMinutes).toBe(0);
    // Paused in the future: it is only held up to now.
    expect(
      searchElapsed(t0, t0 + 999_999, t0 + 30_000).elapsedMinutes
    ).toBeCloseTo(0.5);
  });

  it("an older row kept in minutes becomes a moment on its Perth date", () => {
    const ms = msFromPerthMinutes("2026-10-26", 10 * 60 + 5);
    expect(ms).toBe(Date.parse("2026-10-26T10:05:00+08:00"));
    expect(perthClock(new Date(ms)).minutes).toBe(605);
  });

  it("the Perth clock now carries the seconds", () => {
    const c = perthClock(new Date(Date.parse("2026-10-26T10:05:30+08:00")));
    expect(c.minutes).toBe(605);
    expect(c.exactMinutes).toBeCloseTo(605.5);
  });
});
