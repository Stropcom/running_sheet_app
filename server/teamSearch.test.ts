import { describe, expect, it } from "vitest";
import {
  SEARCH_LIFETIME_MS,
  SEARCH_PRIORITY_MS,
  chooseSearch,
  holdsPriority,
  isSearchLive,
} from "../shared/teamSearch";

describe("Team Search: which search is shown, and when a new one may start", () => {
  const now = 1_000_000_000_000;

  it("a search nobody has touched for four hours is over", () => {
    expect(isSearchLive(now - 60_000, now)).toBe(true);
    expect(isSearchLive(now - SEARCH_LIFETIME_MS, now)).toBe(true);
    expect(isSearchLive(now - SEARCH_LIFETIME_MS - 1, now)).toBe(false);
  });

  it("a search holds its operation for an hour after it was last touched", () => {
    expect(holdsPriority(now - 59 * 60_000, now)).toBe(true);
    expect(holdsPriority(now - SEARCH_PRIORITY_MS, now)).toBe(true);
    expect(holdsPriority(now - SEARCH_PRIORITY_MS - 1, now)).toBe(false);
    // Holding is always inside the lifetime.
    expect(SEARCH_PRIORITY_MS).toBeLessThan(SEARCH_LIFETIME_MS);
  });

  it("the search that started first is the one shown", () => {
    const a = {
      id: "a",
      startedAtMs: now - 50 * 60_000,
      updatedAtMs: now - 1000,
    };
    const b = {
      id: "b",
      startedAtMs: now - 10 * 60_000,
      updatedAtMs: now - 500,
    };
    expect(chooseSearch([b, a], now)?.id).toBe("a");
    expect(chooseSearch([a, b], now)?.id).toBe("a");
  });

  it("a search that is no longer live is not shown, so the next one is", () => {
    const old = {
      id: "old",
      startedAtMs: now - 6 * 3_600_000,
      updatedAtMs: now - 5 * 3_600_000,
    };
    const fresh = {
      id: "new",
      startedAtMs: now - 60_000,
      updatedAtMs: now - 1000,
    };
    expect(chooseSearch([old, fresh], now)?.id).toBe("new");
    expect(chooseSearch([old], now)).toBeNull();
    expect(chooseSearch([], now)).toBeNull();
  });
});
