import { describe, expect, it } from "vitest";
import {
  detectUnidentifiedRepeat,
  findUnidentifiedMentions,
  shortenRepeatedUnidentified,
  usedUnidentifiedCodes,
} from "@shared/unidentified";
import {
  shortenAlreadyMentionedNames,
  computeUsedBracketCodes,
} from "@/lib/mentionAutocomplete";

describe("findUnidentifiedMentions", () => {
  it("finds full mentions of every kind", () => {
    const t =
      "unidentified male (UM1) met an unidentified female (UF2) and unidentified child (UC1).";
    expect(findUnidentifiedMentions(t).map(m => m.code)).toEqual([
      "UM1",
      "UF2",
      "UC1",
    ]);
  });

  it("ignores a bare short name and named people", () => {
    expect(findUnidentifiedMentions("UM1 met Haris Imran BAIG (BAIG)")).toEqual(
      []
    );
  });
});

describe("shortenRepeatedUnidentified", () => {
  it("keeps the first mention in full and shortens later ones", () => {
    expect(
      shortenRepeatedUnidentified(
        "unidentified male (UM1) arrived. Then unidentified male (UM1) left.",
        new Set()
      )
    ).toBe("unidentified male (UM1) arrived. Then UM1 left.");
  });

  it("shortens when introduced on an earlier row", () => {
    expect(
      shortenRepeatedUnidentified(
        "BAIG and unidentified male (UM1) exited the vehicle.",
        new Set(["UM1"])
      )
    ).toBe("BAIG and UM1 exited the vehicle.");
  });

  it("a different person is a first mention in its own right", () => {
    expect(
      shortenRepeatedUnidentified(
        "unidentified male (UM1) and unidentified male (UM2)",
        new Set(["UM1"])
      )
    ).toBe("UM1 and unidentified male (UM2)");
  });
});

describe("detectUnidentifiedRepeat (typing)", () => {
  const known = new Set(["UM1"]);
  it("fires as a known person's full mention is finished", () => {
    const text = "BAIG and unidentified male (UM1)";
    expect(detectUnidentifiedRepeat(text, text.length, known)).toEqual({
      start: 9,
      code: "UM1",
    });
  });

  it("does not fire for a new person", () => {
    const text = "unidentified male (UM2)";
    expect(detectUnidentifiedRepeat(text, text.length, known)).toBeNull();
  });

  it("fires for one introduced earlier in the same text", () => {
    const text = "unidentified male (UM2) left. Later unidentified male (UM2)";
    expect(
      detectUnidentifiedRepeat(text, text.length, new Set())
    ).toMatchObject({ code: "UM2" });
  });
});

describe("the sentences the cards insert", () => {
  const rows = [
    {
      observation:
        "Vehicle 1EXP123, BAIG front passenger, unidentified male (UM1) driver, arrived.",
    },
  ];
  const used = computeUsedBracketCodes([
    ...rows,
    { observation: "unsaved text" },
  ]);

  it("counts a full mention as introduced", () => {
    expect(used.has("UM1")).toBe(true);
    expect(Array.from(usedUnidentifiedCodes(rows))).toEqual(["UM1"]);
  });

  it("writes UM1 once they have been introduced", () => {
    expect(
      shortenAlreadyMentionedNames(
        "BAIG and unidentified male (UM1) exited the vehicle",
        used
      )
    ).toBe("BAIG and UM1 exited the vehicle");
  });

  it("writes them in full while they have not", () => {
    expect(
      shortenAlreadyMentionedNames(
        "BAIG and unidentified male (UM1)",
        new Set()
      )
    ).toBe("BAIG and unidentified male (UM1)");
  });
});

import { checkRepeatedUnidentified } from "./sheetCheck";

describe("Check Sheet: repeated full mention", () => {
  const rows = [
    {
      rowId: 1,
      timeMinutes: 100,
      observation: "BAIG and unidentified male (UM1) arrived.",
    },
    {
      rowId: 2,
      timeMinutes: 200,
      observation: "BAIG and unidentified male (UM1) left.",
    },
    {
      rowId: 3,
      timeMinutes: 300,
      observation:
        "unidentified female (UF1) entered. Later unidentified female (UF1) left.",
    },
  ];

  it("flags only the later full mentions, with a fix to the short name", () => {
    const f = checkRepeatedUnidentified(rows);
    expect(f.map(x => [x.rowId, x.suggestedFix?.correct])).toEqual([
      [2, "unidentified male (UM1)".replace("unidentified male (UM1)", "UM1")],
      [3, expect.stringContaining("UF1")],
    ]);
    expect(f[0].ruleId).toBe("unidentified-full-repeat");
  });

  it("the fix applied once gives the short name and keeps the introduction", () => {
    const f = checkRepeatedUnidentified(rows)[1];
    const fixed = rows[2].observation.replace(
      f.suggestedFix!.wrong,
      f.suggestedFix!.correct
    );
    expect(fixed).toBe("unidentified female (UF1) entered. Later UF1 left.");
  });
});
