import { describe, expect, it } from "vitest";
import { ONLINE_WINDOW_MS, isLoggedIn, teamShownOnMap } from "@shared/teamMap";

const always = { id: 1, mapVisibility: "always" as const };
const online = { id: 2, mapVisibility: "online" as const };

describe("teamShownOnMap", () => {
  it("always shows an 'always' team, even when nobody is on", () => {
    expect(teamShownOnMap(always, new Set(), false)).toBe(true);
  });

  it("hides an 'online' team while nobody in it is logged in", () => {
    expect(teamShownOnMap(online, new Set([1]), false)).toBe(false);
  });

  it("shows an 'online' team once a member is logged in", () => {
    expect(teamShownOnMap(online, new Set([2]), false)).toBe(true);
  });

  it("shows an 'online' team when a member is live on the map", () => {
    expect(teamShownOnMap(online, new Set(), true)).toBe(true);
  });
});

describe("isLoggedIn", () => {
  const now = 1_000_000_000_000;
  it("counts recent activity", () => {
    expect(isLoggedIn(now - 60_000, now)).toBe(true);
    expect(isLoggedIn(new Date(now - ONLINE_WINDOW_MS), now)).toBe(true);
  });
  it("does not count old or missing activity", () => {
    expect(isLoggedIn(now - ONLINE_WINDOW_MS - 1, now)).toBe(false);
    expect(isLoggedIn(null, now)).toBe(false);
  });
});
