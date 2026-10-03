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

import { applyTargetProjectsToSummary } from "../shared/targetStatus";

describe("registry ↔ summary project sync", () => {
  it("makes the summary's TI/LBS/SEEK/CAD match the target and leaves the rest", () => {
    const summary = JSON.stringify([
      { key: "Tracker", detail: "1ABC123" },
      { key: "TI", detail: "AFP" },
      { key: "CAD", detail: "WAPOL" },
    ]);
    const target = JSON.stringify([
      { key: "TI", detail: "WAPOL" },
      { key: "LBS", detail: "AFP" },
    ]);
    // TI detail follows the target, CAD (not on the target) is removed, LBS
    // is added, and the per-deployment Tracker is untouched.
    expect(JSON.parse(applyTargetProjectsToSummary(summary, target)!)).toEqual([
      { key: "Tracker", detail: "1ABC123" },
      { key: "TI", detail: "WAPOL" },
      { key: "LBS", detail: "AFP" },
    ]);
  });

  it("clears the four projects when the target has none, keeping others", () => {
    const summary = JSON.stringify([
      { key: "LBS", detail: "AFP" },
      { key: "Coyotes", detail: "Fremantle" },
    ]);
    expect(JSON.parse(applyTargetProjectsToSummary(summary, null)!)).toEqual([
      { key: "Coyotes", detail: "Fremantle" },
    ]);
    expect(
      applyTargetProjectsToSummary(
        JSON.stringify([{ key: "LBS", detail: "" }]),
        null
      )
    ).toBeNull();
  });
});

import { shortPersonName } from "../client/src/components/PhotoOwnerCaption";

describe("shortPersonName", () => {
  it("reduces a composed registry name to Name SURNAME", () => {
    expect(shortPersonName("Priya Anjali SHAH, born 5 June 1985 (SHAH)")).toBe(
      "Priya Anjali SHAH"
    );
    expect(
      shortPersonName("Daniel Joseph MERCER, born 6 February 1984 (MERCER)")
    ).toBe("Daniel Joseph MERCER");
    expect(shortPersonName("Tomas Ivo VARGA")).toBe("Tomas Ivo VARGA");
    expect(shortPersonName("This target")).toBe("This target");
    expect(shortPersonName("Pacific Route Services Pty Ltd")).toBe(
      "Pacific Route Services Pty Ltd"
    );
  });
});
