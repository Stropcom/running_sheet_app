import { describe, expect, it } from "vitest";
import {
  COMMAND_FEATURES_OWNER_CIN,
  DEFAULT_OFF_FEATURES,
  FEATURE_KEYS,
  buildFeatureMatrix,
  featureForPath,
  featuresFor,
  isFeatureOwner,
} from "../shared/commandFeatures";
import { appRouter } from "./routers";

describe("buildFeatureMatrix", () => {
  it("starts with everything on for every Command, except the default-off features", () => {
    const m = buildFeatureMatrix([]);
    for (const c of Object.keys(m))
      for (const f of FEATURE_KEYS)
        expect(m[c as keyof typeof m][f]).toBe(
          !DEFAULT_OFF_FEATURES.includes(f)
        );
  });
  it("keeps the integrations demo off until a Command is switched on", () => {
    expect(buildFeatureMatrix([]).WESTERN.integrations).toBe(false);
    const m = buildFeatureMatrix([
      { command: "EASTERN", feature: "integrations", enabled: true },
    ]);
    expect(m.EASTERN.integrations).toBe(true);
    expect(m.WESTERN.integrations).toBe(false);
  });
  it("applies only the saved switches", () => {
    const m = buildFeatureMatrix([
      { command: "EASTERN", feature: "import", enabled: false },
      { command: "EASTERN", feature: "crash", enabled: true },
    ]);
    expect(m.EASTERN.import).toBe(false);
    expect(m.EASTERN.crash).toBe(true);
    expect(m.WESTERN.import).toBe(true);
  });
});

describe("featuresFor", () => {
  const m = buildFeatureMatrix([
    { command: "EASTERN", feature: "roster", enabled: false },
  ]);
  it("gives a person their own Command's switches", () => {
    expect(featuresFor({ command: "EASTERN" }, m).roster).toBe(false);
    expect(featuresFor({ command: "WESTERN" }, m).roster).toBe(true);
  });
  it("lets an all-region admin keep every feature", () => {
    expect(
      featuresFor({ command: "EASTERN", allRegions: true }, m).roster
    ).toBe(true);
  });
  it("leaves everything on for an unknown Command, except the default-off features", () => {
    expect(featuresFor({ command: "NOWHERE" }, m).roster).toBe(true);
    expect(featuresFor({ command: "NOWHERE" }, m).integrations).toBe(false);
  });
  it("does not hand the integrations demo to an all-region admin on its own", () => {
    expect(
      featuresFor({ command: "EASTERN", allRegions: true }, m).integrations
    ).toBe(false);
    const on = buildFeatureMatrix([
      { command: "EASTERN", feature: "integrations", enabled: true },
    ]);
    expect(
      featuresFor({ command: "EASTERN", allRegions: true }, on).integrations
    ).toBe(true);
    expect(
      featuresFor({ command: "WESTERN", allRegions: true }, on).integrations
    ).toBe(false);
  });
});

describe("isFeatureOwner", () => {
  it("is only an admin with the owner's CIN", () => {
    expect(
      isFeatureOwner({ role: "admin", cin: COMMAND_FEATURES_OWNER_CIN })
    ).toBe(true);
    expect(
      isFeatureOwner({ role: "member", cin: COMMAND_FEATURES_OWNER_CIN })
    ).toBe(false);
    expect(isFeatureOwner({ role: "admin", cin: "4412" })).toBe(false);
    expect(isFeatureOwner({ role: "admin", cin: null })).toBe(false);
  });
});

describe("featureForPath", () => {
  const procedures = Object.keys(appRouter._def.procedures);
  it("puts every roster procedure under the roster feature", () => {
    const roster = procedures.filter(p => p.startsWith("ctoRoster."));
    expect(roster.length).toBeGreaterThan(40);
    for (const p of roster) expect(featureForPath(p)).toBe("roster");
  });
  it("puts the tasking board and its report under tasking, but not the shared people list", () => {
    const tasking = procedures.filter(
      p => p.startsWith("opManager.") && p !== "opManager.listUsers"
    );
    expect(tasking.length).toBeGreaterThan(8);
    for (const p of tasking) expect(featureForPath(p)).toBe("tasking");
    expect(featureForPath("reports.weeklyTasking")).toBe("tasking");
    expect(featureForPath("opManager.listUsers")).toBeNull();
  });
  it("names real procedures for the import feature", () => {
    expect(procedures).toContain("target.registry.parseDocument");
    expect(featureForPath("target.registry.parseDocument")).toBe("import");
  });
  it("leaves everything else alone", () => {
    expect(featureForPath("sheet.list")).toBeNull();
    expect(featureForPath("auth.me")).toBeNull();
  });
});
