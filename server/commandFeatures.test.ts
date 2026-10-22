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
  it("starts with everything on for every Command, except default-off features", () => {
    const m = buildFeatureMatrix([]);
    for (const c of Object.keys(m))
      for (const f of FEATURE_KEYS)
        expect(m[c as keyof typeof m][f]).toBe(
          !(DEFAULT_OFF_FEATURES as readonly string[]).includes(f)
        );
  });
  it("starts Check Sheet off, and a saved setting can turn it on", () => {
    expect(buildFeatureMatrix([]).WESTERN.sheetCheck).toBe(false);
    const on = buildFeatureMatrix([
      { command: "WESTERN", feature: "sheetCheck", enabled: true },
    ]);
    expect(on.WESTERN.sheetCheck).toBe(true);
    expect(on.EASTERN.sheetCheck).toBe(false);
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
  it("leaves everything on for an unknown Command, except default-off features", () => {
    const f = featuresFor({ command: "NOWHERE" }, m);
    expect(f.roster).toBe(true);
    expect(f.sheetCheck).toBe(false);
  });
  it("keeps Check Sheet off for an all-region admin too, unless their Command turns it on", () => {
    expect(
      featuresFor({ command: "WESTERN", allRegions: true }, m).sheetCheck
    ).toBe(false);
    const on = buildFeatureMatrix([
      { command: "WESTERN", feature: "sheetCheck", enabled: true },
    ]);
    expect(
      featuresFor({ command: "WESTERN", allRegions: true }, on).sheetCheck
    ).toBe(true);
    expect(featuresFor({ command: "WESTERN" }, on).sheetCheck).toBe(true);
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
  it("puts Check Sheet and its dismissals under sheetCheck, using real procedure names", () => {
    expect(procedures).toContain("sheet.check");
    expect(procedures).toContain("sheet.dismissCheckFinding");
    expect(featureForPath("sheet.check")).toBe("sheetCheck");
    expect(featureForPath("sheet.dismissCheckFinding")).toBe("sheetCheck");
  });
  it("leaves everything else alone", () => {
    expect(featureForPath("sheet.list")).toBeNull();
    expect(featureForPath("auth.me")).toBeNull();
  });
});
