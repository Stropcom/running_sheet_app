import { describe, expect, it } from "vitest";
import { formatBail, mdlLabel } from "../shared/targetStatus";

describe("targetStatus", () => {
  it("labels MDL statuses and ignores blanks/unknowns", () => {
    expect(mdlLabel("active")).toBe("Active");
    expect(mdlLabel("none")).toBe("None");
    expect(mdlLabel("suspended")).toBe("Suspended");
    expect(mdlLabel(null)).toBe("");
    expect(mdlLabel("bogus")).toBe("");
  });

  it("summarises bail from its three answers", () => {
    expect(formatBail({})).toBe("");
    expect(formatBail({ bailStatus: "no" })).toBe("No");
    expect(formatBail({ bailStatus: "yes" })).toBe("Yes");
    expect(formatBail({ bailStatus: "yes", bailConditions: "no" })).toBe(
      "Yes — no conditions"
    );
    expect(
      formatBail({
        bailStatus: "yes",
        bailConditions: "yes",
        bailConditionsText: " Curfew 2000–0600 ",
      })
    ).toBe("Yes — conditions: Curfew 2000–0600");
    expect(formatBail({ bailStatus: "yes", bailConditions: "yes" })).toBe(
      "Yes — conditions"
    );
  });
});

import {
  formatSpecialProjects,
  mergeSpecialProjects,
  sanitizeTargetSpecialProjects,
} from "../shared/targetStatus";

describe("special projects", () => {
  it("keeps only the four registry projects, once each, in order", () => {
    const raw = JSON.stringify([
      { key: "CAD", detail: " WAPOL " },
      { key: "Tracker", detail: "x" },
      { key: "TI", detail: "AFP" },
      { key: "TI", detail: "dup" },
    ]);
    expect(JSON.parse(sanitizeTargetSpecialProjects(raw)!)).toEqual([
      { key: "TI", detail: "AFP" },
      { key: "CAD", detail: "WAPOL" },
    ]);
    expect(sanitizeTargetSpecialProjects("")).toBeNull();
    expect(sanitizeTargetSpecialProjects("not json")).toBeNull();
  });

  it("formats for display", () => {
    expect(
      formatSpecialProjects(
        JSON.stringify([
          { key: "TI", detail: "AFP" },
          { key: "LBS", detail: "" },
        ])
      )
    ).toBe("TI (AFP), LBS");
    expect(formatSpecialProjects(null)).toBe("");
  });

  it("merges a target's projects into a summary without disturbing it", () => {
    const summary = JSON.stringify([
      { key: "Tracker", detail: "1ABC123" },
      { key: "LBS", detail: "" },
    ]);
    const target = JSON.stringify([
      { key: "LBS", detail: "WAPOL" },
      { key: "TI", detail: "AFP" },
    ]);
    expect(JSON.parse(mergeSpecialProjects(summary, target)!)).toEqual([
      { key: "Tracker", detail: "1ABC123" },
      { key: "LBS", detail: "WAPOL" },
      { key: "TI", detail: "AFP" },
    ]);
    // A summary's own wording is never overwritten.
    expect(
      JSON.parse(
        mergeSpecialProjects(
          JSON.stringify([{ key: "LBS", detail: "AFP" }]),
          target
        )!
      )[0].detail
    ).toBe("AFP");
    expect(mergeSpecialProjects(null, null)).toBeNull();
  });
});
