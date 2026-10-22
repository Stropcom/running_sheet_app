import { beforeEach, describe, expect, it } from "vitest";
import {
  INTEL_BUILD_WARN_MS,
  INTEL_BUILD_WARN_ROWS,
  OK_LOG_EVERY_MS,
  WARN_LOG_EVERY_MS,
  describeIntelBuild,
  getLastIntelBuild,
  recordIntelBuild,
  resetIntelBuildWatch,
  shouldLog,
} from "./intelBuildWatch";
import {
  INTEL_SOURCE_TABLES,
  fingerprintFromRow,
  fingerprintSql,
} from "./intelCache";

describe("describeIntelBuild", () => {
  it("is fine while the build is quick and the data small", () => {
    const r = describeIntelBuild(900, 5000, 120);
    expect(r.level).toBe("ok");
    expect(r.message).toContain("900 ms");
    expect(r.message).toContain("5,000 rows");
    expect(r.message).not.toContain("WARNING");
  });
  it("warns when one rebuild is slow", () => {
    const r = describeIntelBuild(INTEL_BUILD_WARN_MS, 5000, 120);
    expect(r.level).toBe("warn");
    expect(r.message).toContain("WARNING");
    expect(r.message).toContain("Intelligence redesign plan");
  });
  it("warns at the row milestone even when it is still quick", () => {
    expect(describeIntelBuild(400, INTEL_BUILD_WARN_ROWS - 1, 1).level).toBe(
      "ok"
    );
    const r = describeIntelBuild(400, INTEL_BUILD_WARN_ROWS, 1);
    expect(r.level).toBe("warn");
    expect(r.message).toContain("20,000");
  });
  it("copes with an unknown row count", () => {
    const r = describeIntelBuild(1500, null, 10);
    expect(r.level).toBe("ok");
    expect(r.message).not.toContain("rows");
    expect(r.message).toContain("1.5 s");
  });
});

describe("shouldLog", () => {
  const ok = describeIntelBuild(100, 10, 1);
  const warn = describeIntelBuild(9000, 10, 1);
  it("always logs the first build", () => {
    expect(shouldLog(ok, 0, { at: 0, level: null })).toBe(true);
  });
  it("spaces out healthy lines", () => {
    expect(shouldLog(ok, OK_LOG_EVERY_MS - 1, { at: 0, level: "ok" })).toBe(
      false
    );
    expect(shouldLog(ok, OK_LOG_EVERY_MS, { at: 0, level: "ok" })).toBe(true);
  });
  it("spaces out repeated warnings, but logs a change straight away", () => {
    expect(
      shouldLog(warn, WARN_LOG_EVERY_MS - 1, { at: 0, level: "warn" })
    ).toBe(false);
    expect(shouldLog(warn, WARN_LOG_EVERY_MS, { at: 0, level: "warn" })).toBe(
      true
    );
    expect(shouldLog(warn, 1, { at: 0, level: "ok" })).toBe(true);
    expect(shouldLog(ok, 1, { at: 0, level: "warn" })).toBe(true);
  });
});

describe("recordIntelBuild", () => {
  beforeEach(() => resetIntelBuildWatch());
  it("logs the first build, holds back quick repeats, and remembers the latest", () => {
    const lines: [string, string][] = [];
    const log = (level: "ok" | "warn", message: string) =>
      lines.push([level, message]);
    recordIntelBuild(100, 10, 1, 1000, log);
    recordIntelBuild(110, 10, 1, 2000, log); // too soon: not logged
    recordIntelBuild(8000, 10, 1, 3000, log); // got worse: logged as a warning
    expect(lines.map(l => l[0])).toEqual(["ok", "warn"]);
    expect(getLastIntelBuild()?.ms).toBe(8000);
  });
});

describe("the fingerprint carries the running sheet row count", () => {
  it("reads it from the sheet_rows counter", () => {
    const row: Record<string, number> = { now_s: 1000 };
    INTEL_SOURCE_TABLES.forEach((t, i) => {
      row[`c${i}`] = t.table === "sheet_rows" ? 12345 : 7;
      row[`m${i}`] = 1;
      row[`u${i}`] = 900;
    });
    expect(fingerprintFromRow(row)?.rows).toBe(12345);
    expect(fingerprintSql()).toContain("sheet_rows");
  });
});
