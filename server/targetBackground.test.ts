import { describe, expect, it } from "vitest";
import {
  TARGET_BACKGROUND_MAX,
  importedBackgroundLabel,
  labelledImportedBackground,
  normaliseTargetBackground,
} from "@shared/targetBackground";

describe("normaliseTargetBackground", () => {
  it("keeps line breaks and paragraph gaps", () => {
    expect(normaliseTargetBackground("One.\n\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("turns Windows and old-Mac line endings into \\n", () => {
    expect(normaliseTargetBackground("A\r\nB\rC")).toBe("A\nB\nC");
  });

  it("trims outer whitespace but not inner spacing", () => {
    expect(normaliseTargetBackground("  \n a  b \n ")).toBe("a  b");
  });

  it("returns null for empty or whitespace-only text (cleared)", () => {
    expect(normaliseTargetBackground("")).toBeNull();
    expect(normaliseTargetBackground(" \n\t ")).toBeNull();
  });

  it("caps the length", () => {
    const out = normaliseTargetBackground(
      "x".repeat(TARGET_BACKGROUND_MAX + 50)
    );
    expect(out).toHaveLength(TARGET_BACKGROUND_MAX);
  });

  it("does not interpret markup", () => {
    expect(normaliseTargetBackground("<b>hi</b> **x**")).toBe(
      "<b>hi</b> **x**"
    );
  });
});

describe("labelledImportedBackground", () => {
  it("puts the operation's label above the narrative", () => {
    expect(
      labelledImportedBackground("Lives with his mother.", "Op Falcon")
    ).toBe("From Op Falcon document:\nLives with his mother.");
  });

  it("falls back to a plain label when no operation is picked yet", () => {
    expect(importedBackgroundLabel("  ")).toBe("From imported document:");
    expect(labelledImportedBackground("Text", null)).toBe(
      "From imported document:\nText"
    );
  });

  it("gives nothing when the document had no narrative", () => {
    expect(labelledImportedBackground("  \n ", "Op Falcon")).toBe("");
    expect(labelledImportedBackground(undefined, "Op Falcon")).toBe("");
  });

  it("normalises line endings", () => {
    expect(labelledImportedBackground("A\r\nB", "Op X")).toBe(
      "From Op X document:\nA\nB"
    );
  });
});

describe("labelledImportedBackground — wrapped lines are joined back up", () => {
  const body = (narrative: string) =>
    labelledImportedBackground(narrative, "Op X").replace(
      /^From Op X document:\n/,
      ""
    );

  it("joins a sentence the document wrapped mid-way (digit, lower case, @)", () => {
    const raw = [
      "Haris Imran BAIG is now recorded at 18 Saffron Court, BENTLEY WA 6102. The former address at 76 Almond Street, CANNINGTON WA",
      "",
      "6107 remains as a previous address.",
      "",
      "At 0749 hours, BAIG departed 76 Almond Street, CANNINGTON WA 6107 in 1ORB419 (WA) 2020 black Toyota Kluger wagon. BAIG",
      "",
      "attended 2/144 Bannister Road, CANNING VALE WA 6155 and met Nadia Farah QURESH.",
      "",
      "BAIG was linked to mobile 0491 570 168, email haris.baig@example.com, Signal username HarisB_419 and Telegram username",
      "",
      "@orchard_hb. Customer ID OTG-7713 appeared in email footers.",
    ].join("\n");
    expect(body(raw)).toBe(
      [
        "Haris Imran BAIG is now recorded at 18 Saffron Court, BENTLEY WA 6102. The former address at 76 Almond Street, CANNINGTON WA 6107 remains as a previous address.",
        "At 0749 hours, BAIG departed 76 Almond Street, CANNINGTON WA 6107 in 1ORB419 (WA) 2020 black Toyota Kluger wagon. BAIG attended 2/144 Bannister Road, CANNING VALE WA 6155 and met Nadia Farah QURESH.",
        "BAIG was linked to mobile 0491 570 168, email haris.baig@example.com, Signal username HarisB_419 and Telegram username @orchard_hb. Customer ID OTG-7713 appeared in email footers.",
      ].join("\n\n")
    );
  });

  it("keeps headings, dated headings and short label lines on their own lines", () => {
    const raw = [
      "VEHICLES",
      "",
      "Version 3 update - 25 September 2026:",
      "",
      "Nadia Farah QURESHI",
      "",
      "20 Jasmine Loop, WILLETTON WA 6155.",
      "",
      "Mobile: 0491 570 166",
      "",
      "Benjamin Scott YATES",
    ].join("\n");
    expect(body(raw)).toBe(raw);
  });

  it("joins a wrapped label that ends in a colon, but not a short dated one", () => {
    const raw =
      "New business email: h.baig@orchardtrading.example.com Business email: enquiries@orchard.example.com Shipment:\nOTG-SH-60421 Container: OTRU4619283";
    expect(body(raw)).toBe(raw.replace("\n", " "));
    expect(body("07 August 2026:\nAt 0749 hours, BAIG left.")).toBe(
      "07 August 2026:\nAt 0749 hours, BAIG left."
    );
  });

  it("changes no words and leaves finished sentences alone", () => {
    const raw = "First sentence.\nSecond sentence.\n\nThird.";
    expect(body(raw)).toBe(raw);
  });
});
