import { describe, expect, it } from "vitest";
import { datesKeyOf, findingKey } from "@shared/ebaFindingKey";

describe("finding identity", () => {
  it("is the rule, the person and the sorted dates", () => {
    expect(datesKeyOf(["2040-06-05", "2040-06-04"])).toBe(
      "2040-06-04,2040-06-05"
    );
    expect(
      findingKey({
        ruleKey: "max_hours_7day",
        memberId: 3,
        dates: ["2040-06-05", "2040-06-04"],
      })
    ).toBe("max_hours_7day|3|2040-06-04,2040-06-05");
  });
  it("is the same finding in any date order, and a new one for other dates, people or rules", () => {
    const a = findingKey({
      ruleKey: "r",
      memberId: 1,
      dates: ["2040-06-04", "2040-06-05"],
    });
    expect(
      findingKey({
        ruleKey: "r",
        memberId: 1,
        dates: ["2040-06-05", "2040-06-04"],
      })
    ).toBe(a);
    expect(
      findingKey({ ruleKey: "r", memberId: 1, dates: ["2040-06-04"] })
    ).not.toBe(a);
    expect(
      findingKey({
        ruleKey: "r",
        memberId: 2,
        dates: ["2040-06-04", "2040-06-05"],
      })
    ).not.toBe(a);
    expect(
      findingKey({
        ruleKey: "q",
        memberId: 1,
        dates: ["2040-06-04", "2040-06-05"],
      })
    ).not.toBe(a);
  });
});
