import { describe, expect, it } from "vitest";
import {
  blendGradients,
  mixHex,
  DEFAULT_TEAM_COLOURS,
  FALLBACK_TEAM_COLOUR,
  readableOn,
  shadeOf,
  teamColourFor,
  teamShades,
  tintOf,
} from "@shared/teamColours";
import {
  clampZoom,
  fitZoom,
  labelsHidden,
  readSavedZoom,
  stepZoom,
} from "@shared/rosterZoom";

describe("team colours", () => {
  const teams = [
    { name: "Team 1", colour: "#112233" },
    { name: "PTT", colour: null },
    { name: "Capability", colour: "not a colour" },
  ];
  it("uses the colour set in User Management, matched by name", () => {
    expect(teamColourFor(teams, "Team 1")).toBe("#112233");
    expect(teamColourFor(teams, "  team 1 ")).toBe("#112233");
  });
  it("keeps the standing colour when the team has none or it is not a colour", () => {
    expect(teamColourFor(teams, "PTT")).toBe(DEFAULT_TEAM_COLOURS.ptt);
    expect(teamColourFor(teams, "Capability")).toBe(
      DEFAULT_TEAM_COLOURS.capability
    );
    expect(teamColourFor([], "Team 2")).toBe(DEFAULT_TEAM_COLOURS["team 2"]);
  });
  it("greys a team nobody has heard of", () => {
    expect(teamColourFor(teams, "Mystery")).toBe(FALLBACK_TEAM_COLOUR);
  });
  it("mixes tints and shades toward white and black", () => {
    expect(tintOf("#000000", 1)).toBe("#ffffff");
    expect(tintOf("#000000", 0)).toBe("#000000");
    expect(shadeOf("#ffffff", 1)).toBe("#000000");
    expect(tintOf("#ec4899", 0.5)).toBe("#f6a4cc");
  });
  it("picks readable text and builds panel shades", () => {
    expect(readableOn("#f9a825")).toBe("#0f172a");
    expect(readableOn("#1e3a8a")).toBe("#ffffff");
    const s = teamShades("#1976d2");
    expect(s.border).toBe("#1976d2");
    expect(s.bg).toBe(tintOf("#1976d2", 0.86));
    expect(teamShades("junk").border).toBe(FALLBACK_TEAM_COLOUR);
  });
  it("mixes two colours evenly", () => {
    expect(mixHex("#000000", "#ffffff")).toBe("#808080");
    expect(mixHex("#ec4899", "#ec4899")).toBe("#ec4899");
  });
  it("splits two team colours for a blended day", () => {
    const g = blendGradients("#ec4899", "#1976d2");
    expect(g.swatch).toContain("#ec4899 0 50%");
    expect(g.swatch).toContain("#1976d2 50% 100%");
    expect(g.band).toContain(tintOf("#ec4899", 0.86));
  });
});

describe("roster zoom", () => {
  it("keeps the zoom between 25% and 100% in 5% steps", () => {
    expect(clampZoom(2)).toBe(1);
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(0.62)).toBe(0.6);
    expect(clampZoom(NaN)).toBe(1);
    expect(stepZoom(1, 1)).toBe(1);
    expect(stepZoom(0.5, -1)).toBe(0.45);
    expect(stepZoom(0.25, -1)).toBe(0.25);
  });
  it("leaves the shift names out when it is too small to read", () => {
    expect(labelsHidden(1)).toBe(false);
    expect(labelsHidden(0.55)).toBe(false);
    expect(labelsHidden(0.5)).toBe(true);
  });
  it("fits the grid to the height, rounding down so it really fits", () => {
    // 1000px tall at 100%; 450px available → 45%
    expect(fitZoom(450, 1000, 1)).toBe(0.45);
    // measured at 50% (500px) is the same grid
    expect(fitZoom(450, 500, 0.5)).toBe(0.45);
    expect(fitZoom(460, 1000, 1)).toBe(0.45);
    // already fits: never zooms in past 100%
    expect(fitZoom(2000, 1000, 1)).toBe(1);
    // too tall even at the minimum
    expect(fitZoom(100, 1000, 1)).toBe(0.25);
    expect(fitZoom(0, 1000, 1)).toBe(1);
  });
  it("reads a saved zoom, falling back to 100%", () => {
    expect(readSavedZoom("0.5")).toBe(0.5);
    expect(readSavedZoom(null)).toBe(1);
    expect(readSavedZoom("abc")).toBe(1);
    expect(readSavedZoom("7")).toBe(1);
  });
});
