import { describe, expect, it } from "vitest";
import {
  formatIntelAddress,
  tidyRepeatedPlaceName,
} from "@shared/addressFormat";

const shown = (label: string) =>
  tidyRepeatedPlaceName(formatIntelAddress(label));

describe("tidyRepeatedPlaceName", () => {
  it("shows a place name once when the bracket repeats it (the Terminal 4 pair)", () => {
    expect(shown("Terminal 4, Terminal 4")).toBe("Terminal 4");
    expect(shown("Terminal 2, Terminal 2")).toBe("Terminal 2");
    expect(shown("Terminal 4, Perth Airport WA, Terminal 4")).toBe(
      "Terminal 4, Perth Airport WA"
    );
  });

  it("is case and spacing blind, and repeats until nothing repeats", () => {
    expect(tidyRepeatedPlaceName("Balthazar,  balthazar")).toBe("Balthazar");
    expect(tidyRepeatedPlaceName("A, B, A, A")).toBe("A, B");
  });

  it("leaves ordinary addresses and single names alone", () => {
    expect(tidyRepeatedPlaceName("1 Smith Street, MELVILLE")).toBe(
      "1 Smith Street, MELVILLE"
    );
    expect(tidyRepeatedPlaceName("Crown Towers Perth")).toBe(
      "Crown Towers Perth"
    );
    expect(tidyRepeatedPlaceName("")).toBe("");
  });
});
