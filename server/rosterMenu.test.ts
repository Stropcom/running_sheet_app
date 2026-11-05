import { describe, expect, it } from "vitest";
import { isRosterToolsPath } from "../shared/rosterMenu";

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
