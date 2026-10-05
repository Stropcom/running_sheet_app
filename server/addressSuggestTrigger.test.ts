import { describe, it, expect } from "vitest";
import { detectAddressSuggestTrigger } from "@shared/addressSuggestTrigger";

const at = (s: string) => detectAddressSuggestTrigger(s, s.length);

describe("detectAddressSuggestTrigger", () => {
  it("fires on a street number and the start of a street", () => {
    expect(at("travelled to 13 D")?.text).toBe("13 D");
    expect(at("travelled to 47 Cooper")?.text).toBe("47 Cooper");
    expect(at("parked at 2/144 Bann")?.text).toBe("2/144 Bann");
    expect(at("13 Denford St")?.text).toBe("13 Denford St");
  });

  it("reports where the typed text starts", () => {
    const t = at("went to 13 D");
    expect(t?.start).toBe("went to ".length);
  });

  it("does not fire on counts, times and measurements", () => {
    expect(at("observed 2 males")).toBeNull();
    expect(at("remained for 15 minutes")).toBeNull();
    expect(at("approximately 3 persons")).toBeNull();
    expect(at("at 10 am")).toBeNull();
    expect(at("aged 35 years")).toBeNull();
  });

  it("does not fire on a vehicle rego or inside a bracket", () => {
    expect(at("Vehicle 1HIB84, BAIG driver")).toBeNull();
    expect(at("KENWICK WA (13 Den")).toBeNull();
  });

  it("does not fire when the cursor has moved past the address", () => {
    expect(detectAddressSuggestTrigger("13 Denford and more", 6)?.text).toBe(
      "13 Den"
    );
    expect(at("13 Denford Street, KENWICK WA ")).toBeNull();
  });

  it("trims a prose word off the end", () => {
    expect(at("went to 12 Smith and")?.text).toBe("12 Smith");
  });
});
