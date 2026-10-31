import { describe, expect, it } from "vitest";
import { insideCapsSuburb } from "@shared/suburbMention";

/** The position of the nth occurrence of `word` in `text`. */
function at(text: string, word: string, nth = 0) {
  let from = 0;
  let i = -1;
  for (let k = 0; k <= nth; k++) {
    i = text.indexOf(word, from);
    from = i + 1;
  }
  return [i, i + word.length] as const;
}

describe("a capital word inside a suburb is not a person", () => {
  const advent =
    "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at Advent Park, 345 Kalamunda Road, MAIDA VALE WA (Advent Park)";

  it("the suburb's VALE, followed by the state, is a suburb", () => {
    expect(insideCapsSuburb(advent, ...at(advent, "VALE"))).toBe(true);
    expect(insideCapsSuburb(advent, ...at(advent, "MAIDA"))).toBe(true);
  });

  it("a person on the same row is still a person", () => {
    expect(insideCapsSuburb(advent, ...at(advent, "DARYANI"))).toBe(false);
  });

  it("works with a postcode, another state and a one-word suburb", () => {
    const a = "arrived at 12 Smith Street, SOUTH PERTH WA 6151";
    expect(insideCapsSuburb(a, ...at(a, "PERTH"))).toBe(true);
    const b = "departed 5 George Street, SURRY HILLS NSW 2010";
    expect(insideCapsSuburb(b, ...at(b, "HILLS"))).toBe(true);
    const c = "arrived at 9 Low Street, VALE WA";
    expect(insideCapsSuburb(c, ...at(c, "VALE"))).toBe(true);
  });

  it("a suburb written after a street and a comma, with no state, still counts at the end of the address", () => {
    const a = "arrived at 345 Kalamunda Road, MAIDA VALE (Advent Park)";
    expect(insideCapsSuburb(a, ...at(a, "VALE"))).toBe(true);
    const b = "arrived at 345 Kalamunda Road, MAIDA VALE.";
    expect(insideCapsSuburb(b, ...at(b, "VALE"))).toBe(true);
    const c = "arrived at 345 Kalamunda Road, MAIDA VALE";
    expect(insideCapsSuburb(c, ...at(c, "VALE"))).toBe(true);
  });

  it("a surname written as a surname is not a suburb", () => {
    for (const [text, word] of [
      ["Elliot VALE departed the address", "VALE"],
      ["met VALE at the park", "VALE"],
      ["Elliot Marcus VALE (VALE) walked to the car", "VALE"],
      // After a street and a comma, but the sentence goes on: a person.
      ["walked along Smith Street, VALE arrived and left", "VALE"],
      ["DARYANI and VALE entered the shop", "VALE"],
    ] as const)
      expect(insideCapsSuburb(text, ...at(text, word))).toBe(false);
  });

  it("the same word can be a person in one place and a suburb in another on one row", () => {
    const t = "Elliot VALE departed 5 X Street, MAIDA VALE WA";
    expect(insideCapsSuburb(t, ...at(t, "VALE", 0))).toBe(false);
    expect(insideCapsSuburb(t, ...at(t, "VALE", 1))).toBe(true);
  });

  it("is false when there are no capital words, or none overlap", () => {
    expect(insideCapsSuburb("walked to the shop", 0, 6)).toBe(false);
    expect(insideCapsSuburb("", 0, 0)).toBe(false);
  });
});

describe("the Sheet Summary keeps a suburb that is spelled like the target's surname", () => {
  it("turns the target into TGT but leaves MAIDA VALE alone", async () => {
    const { buildSummaryAbbreviatedText } = await import("./db/governance");
    const out = buildSummaryAbbreviatedText(
      "VALE departed 12 Smith Street, PERTH WA and walked to Advent Park, 345 Kalamunda Road, MAIDA VALE WA.",
      "VALE"
    );
    expect(out).toContain("TGT departed");
    expect(out).toContain("MAIDA VALE WA");
    expect(out).not.toContain("MAIDA TGT");
  });
});
