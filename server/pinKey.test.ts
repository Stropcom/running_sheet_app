import { describe, expect, it } from "vitest";
import { pinKeyForTappedPlace } from "../shared/markerLink";

const LABELS = [
  "La Lune, 73 George Street, EAST FREMANTLE",
  "Chop Chop BBQ, 46 Hulme Court, MYAREE",
  "27 Olding Way, MELVILLE",
  "Bicton Tavern, 1 Point Walter Road, BICTON",
];

describe("the key a tapped place's pin is saved under", () => {
  it("finds the location's own label from the tapped address", () => {
    expect(
      pinKeyForTappedPlace(
        LABELS,
        "La Lune, 73 George St, East Fremantle WA (La Lune)"
      )
    ).toBe("La Lune, 73 George Street, EAST FREMANTLE");
    expect(
      pinKeyForTappedPlace(
        LABELS,
        "Chop Chop BBQ, 46 Hulme Ct, Myaree WA (Chop Chop BBQ)"
      )
    ).toBe("Chop Chop BBQ, 46 Hulme Court, MYAREE");
  });

  it("falls back to the one location that starts with the short name", () => {
    expect(
      pinKeyForTappedPlace(LABELS, "Bicton Tavern, Bicton WA (Bicton Tavern)")
    ).toBe("Bicton Tavern, 1 Point Walter Road, BICTON");
  });

  it("never guesses between two places", () => {
    expect(
      pinKeyForTappedPlace(
        ["La Lune, 1 A Street, PERTH", "La Lune, 2 B Street, PERTH"],
        "La Lune, Perth WA (La Lune)"
      )
    ).toBeNull();
    expect(
      pinKeyForTappedPlace(
        LABELS,
        "Somewhere Else, 9 X Road, Y WA (Somewhere Else)"
      )
    ).toBeNull();
  });
});

describe("a place picked from the suggestions is filed under its map label", () => {
  it("the label read from the inserted text is the label the map shows", async () => {
    const { extractEntitiesFromText } = await import("./db");
    for (const [text, label] of [
      [
        "La Lune, 73 George Street, EAST FREMANTLE WA (La Lune)",
        "La Lune, 73 George Street, EAST FREMANTLE",
      ],
      [
        "Chop Chop BBQ, 46 Hulme Court, MYAREE WA (Chop Chop BBQ)",
        "Chop Chop BBQ, 46 Hulme Court, MYAREE",
      ],
    ]) {
      const place = extractEntitiesFromText(text).find(
        e => e.type === "address"
      );
      expect(place?.shortForm).toBe(label);
      // …and the same label when that text sits inside a longer sentence.
      const inSentence = extractEntitiesFromText(
        `HOGAN entered ${text} and continued out of sight.`
      ).find(e => e.type === "address");
      expect(inSentence?.shortForm).toBe(label);
    }
  });
});
