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
