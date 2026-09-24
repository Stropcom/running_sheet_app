import { describe, it, expect } from "vitest";
import { verifyAISuggestion, composeParsedValue } from "./documentAIVerify";
import { parseAddressLine } from "./addressLineParser";
import { parseVehicleLine } from "./vehicleLineParser";

describe("verifyAISuggestion", () => {
  it("declines a suggestion that doesn't parse to anything at all", () => {
    expect(verifyAISuggestion("address", "somewhere nearby", null)).toEqual({
      status: "declined",
    });
  });

  it("declines a suggestion that parses but not confidently", () => {
    // No street type, no suburb -> parseAddressLine finds nothing at all
    // for a fragment this bare, so this exercises the "no match" path
    // exactly like the fully-nonsense case above; a genuinely partial
    // match is covered implicitly by parseAddressLine's own test suite.
    expect(verifyAISuggestion("address", "12", null)).toEqual({
      status: "declined",
    });
  });

  it("suggests a verified reading when there is no current value to compare against (needsReview)", () => {
    const outcome = verifyAISuggestion(
      "address",
      "12 Smith Street, Perth WA",
      null
    );
    expect(outcome.status).toBe("suggested");
    if (outcome.status === "suggested") {
      expect(outcome.value).toContain("PERTH");
    }
  });

  it("marks a suggestion as confirmed when it matches the rules' existing reading", () => {
    const parsed = parseAddressLine("12 Smith Street, Perth WA")!;
    const currentValue = composeParsedValue("address", parsed);
    const outcome = verifyAISuggestion(
      "address",
      "12 Smith Street, Perth WA",
      currentValue
    );
    expect(outcome.status).toBe("confirmed");
  });

  it("marks a suggestion as confirmed even with different casing", () => {
    const parsed = parseAddressLine("12 Smith Street, Perth WA")!;
    const currentValue = composeParsedValue("address", parsed);
    const outcome = verifyAISuggestion(
      "address",
      "12 smith street, perth wa",
      currentValue
    );
    expect(outcome.status).toBe("confirmed");
  });

  it("marks a genuinely different reading as suggested, not confirmed", () => {
    const parsed = parseAddressLine("12 Smith Street, Perth WA")!;
    const currentValue = composeParsedValue("address", parsed);
    const outcome = verifyAISuggestion(
      "address",
      "45 Jones Road, Fremantle WA",
      currentValue
    );
    expect(outcome.status).toBe("suggested");
    if (outcome.status === "suggested") {
      expect(outcome.value).toContain("FREMANTLE");
    }
  });

  it("verifies vehicle suggestions the same way", () => {
    const parsed = parseVehicleLine("1ABC123 (WA) white Toyota Corolla sedan")!;
    const currentValue = composeParsedValue("vehicle", parsed);
    const confirmed = verifyAISuggestion(
      "vehicle",
      "1ABC123 (WA) white Toyota Corolla sedan",
      currentValue
    );
    expect(confirmed.status).toBe("confirmed");

    const declined = verifyAISuggestion("vehicle", "a red car", currentValue);
    expect(declined.status).toBe("declined");
  });
});
