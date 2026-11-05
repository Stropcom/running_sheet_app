import { describe, expect, it } from "vitest";
import {
  isOpManagerPath,
  isProceduresPath,
  isRosterToolsPath,
} from "../shared/rosterMenu";

describe("Roster tools menu group", () => {
  it("covers the five tool pages, including a draft's own page", () => {
    for (const p of [
      "/cto-roster/drafts",
      "/cto-roster/drafts/12",
      "/cto-roster/saved-rosters",
      "/cto-roster/saved-rosters/3",
      "/cto-roster/ea-compliance",
      "/cto-roster/audit",
      "/cto-roster/members",
    ])
      expect(isRosterToolsPath(p), p).toBe(true);
  });

  it("leaves the roster, My Shifts, Outlook and other pages out", () => {
    for (const p of [
      "/cto-roster",
      "/cto-roster/my-shifts",
      "/cto-roster/outlook",
      "/operation-manager",
      "/reports/weekly-activity",
      "/",
    ])
      expect(isRosterToolsPath(p), p).toBe(false);
  });
});

describe("which side-menu folder a page belongs to", () => {
  it("keeps Weekly Activity and the Weekly Tasking Report under Op Manager", () => {
    for (const p of [
      "/operation-manager",
      "/cto-roster",
      "/cto-roster/audit",
      "/reports/weekly-activity",
      "/reports/weekly-tasking",
    ])
      expect(isOpManagerPath(p), p).toBe(true);
    expect(isOpManagerPath("/governance")).toBe(false);
    expect(isOpManagerPath("/administration/smeac")).toBe(false);
  });

  it("does not count a /reports page as a Procedures page", () => {
    expect(isProceduresPath("/reports/weekly-activity")).toBe(false);
    for (const p of [
      "/administration/vehicle-crash",
      "/administration/uco-guide",
      "/administration/smeac/4",
    ])
      expect(isProceduresPath(p), p).toBe(true);
  });
});
