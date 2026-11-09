import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTEL_REPORT_DISCLAIMER,
  SUMMARY_DISCLAIMER,
  disclaimerBoxHtml,
} from "../shared/summaryDisclaimer";
import { buildPackageDocument } from "../client/src/lib/intelPackage";

describe("export disclaimers", () => {
  it("the wording is exactly what was asked for", () => {
    expect(SUMMARY_DISCLAIMER).toBe(
      "This summary document is not a certified running sheet. All information should be checked and verified against the certified corresponding running sheet."
    );
    expect(INTEL_REPORT_DISCLAIMER).toBe(
      "This document is not a certified evidentiary document. All information should be checked and verified against the certified evidentiary running sheets."
    );
  });

  it("the box is self-contained and escapes its text", () => {
    const html = disclaimerBoxHtml("a < b & c");
    expect(html).toContain('class="disclaimer"');
    expect(html).toContain("a &lt; b &amp; c");
    expect(html).toContain("style=");
  });

  it("the Intelligence Package carries the notice on its cover", () => {
    const html = buildPackageDocument({
      docTitle: "t",
      coverTitle: "Intelligence Package",
      coverSubject: "RAVEN",
      coverMeta: "m",
      sections: [{ title: "Heat Map", html: "<p>x</p>" }],
    });
    expect(html).toContain(INTEL_REPORT_DISCLAIMER);
  });

  // Every exported intelligence report builds its page from one of these
  // files; the notice must stay in each (so removing it fails here).
  const root = path.resolve(__dirname, "..");
  const INTEL_EXPORTS = [
    "client/src/components/AssociateProfileContent.tsx",
    "client/src/components/LocationProfileContent.tsx",
    "client/src/components/OperationProfileContent.tsx",
    "client/src/components/TargetProfileContent.tsx",
    "client/src/components/VehicleProfileContent.tsx",
    "client/src/lib/dayRouteExport.ts",
    "client/src/lib/intelPackage.ts",
    "client/src/lib/placesReportExport.ts",
    "client/src/pages/EgoNetworkMap.tsx",
    "client/src/pages/IntelligenceHeatMap.tsx",
    "client/src/pages/IntelligencePatternOfLife.tsx",
    "client/src/pages/WeeklyActivityReportPage.tsx",
  ];
  for (const f of INTEL_EXPORTS)
    it(`${f} prints the evidentiary notice`, () => {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      expect(src).toContain("INTEL_REPORT_DISCLAIMER");
      expect(src).toContain("disclaimerBoxHtml(");
    });
});
