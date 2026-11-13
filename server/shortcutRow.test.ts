import { describe, expect, it } from "vitest";
import {
  shortcutInsertText,
  shortcutRowSubject,
  shortcutRowText,
  startsNewSentence,
} from "../shared/shortcutRow";

const TP =
  "had a mobile phone to his ear and appeared to be in conversation on the phone.";

describe("shortcutRowSubject", () => {
  it("is the person target's TGT short form, in capitals", () => {
    expect(shortcutRowSubject({ tgt: "SANTOS", surname: "SANTOS" })).toBe(
      "SANTOS"
    );
    expect(shortcutRowSubject({ tgt: "santos" })).toBe("SANTOS");
  });
  it("falls back to the surname when there is no short form", () => {
    expect(shortcutRowSubject({ tgt: "  ", surname: "Park" })).toBe("PARK");
    expect(shortcutRowSubject({ tgt: null, surname: "PARK" })).toBe("PARK");
  });
  it("the short form wins over the surname (it is the word the team writes)", () => {
    expect(shortcutRowSubject({ tgt: "P.HILL", surname: "HILL" })).toBe(
      "P.HILL"
    );
  });
  it("is null with no person target — a name is never guessed", () => {
    expect(shortcutRowSubject(null)).toBeNull();
    expect(shortcutRowSubject(undefined)).toBeNull();
    expect(shortcutRowSubject({})).toBeNull();
    expect(
      shortcutRowSubject({ targetType: "vehicle", tgt: "1ABC123" })
    ).toBeNull();
    expect(
      shortcutRowSubject({ targetType: "location", surname: "X" })
    ).toBeNull();
    expect(shortcutRowSubject({ targetType: "person", tgt: "SANTOS" })).toBe(
      "SANTOS"
    );
  });
});

describe("shortcutRowText", () => {
  it("puts the surname first and leaves the expansion exactly as saved", () => {
    expect(shortcutRowText("SANTOS", TP)).toBe(`SANTOS ${TP}`);
    expect(shortcutRowText("SANTOS", `  ${TP}  `)).toBe(`SANTOS ${TP}`);
  });
  it("never re-cases or rewrites the expansion", () => {
    expect(shortcutRowText("SANTOS", "Had a phone")).toBe("SANTOS Had a phone");
    expect(shortcutRowText("SANTOS", "texted on an iPhone.")).toBe(
      "SANTOS texted on an iPhone."
    );
  });
  it("does not repeat a name the expansion already starts with", () => {
    expect(shortcutRowText("SANTOS", "SANTOS used the phone.")).toBe(
      "SANTOS used the phone."
    );
    expect(shortcutRowText("SANTOS", "santos used the phone.")).toBe(
      "santos used the phone."
    );
  });
  it("a longer word that merely begins with the name is not the name", () => {
    expect(shortcutRowText("SANT", "SANTOS waved.")).toBe("SANT SANTOS waved.");
  });
  it("is null with no subject or no expansion", () => {
    expect(shortcutRowText(null, TP)).toBeNull();
    expect(shortcutRowText("", TP)).toBeNull();
    expect(shortcutRowText("SANTOS", "  ")).toBeNull();
    expect(shortcutRowText("SANTOS", null)).toBeNull();
  });
});

describe("an Own row chip pressed while an observation is open", () => {
  it("goes in as saved, at the cursor, in the middle of a sentence", () => {
    expect(
      shortcutInsertText("SANTOS", TP, "SANTOS walked to the door and ")
    ).toBe(TP);
    expect(shortcutInsertText("SANTOS", TP, "SANTOS entered the shop, ")).toBe(
      TP
    );
  });

  it("starts with the target's name when it begins a new sentence", () => {
    expect(shortcutInsertText("SANTOS", TP, "")).toBe(`SANTOS ${TP}`);
    expect(shortcutInsertText("SANTOS", TP, "   ")).toBe(`SANTOS ${TP}`);
    expect(
      shortcutInsertText("SANTOS", TP, "SANTOS exited the vehicle. ")
    ).toBe(`SANTOS ${TP}`);
    expect(
      shortcutInsertText("SANTOS", TP, "SANTOS exited the vehicle.\n\n")
    ).toBe(`SANTOS ${TP}`);
  });

  it("never doubles a name the expansion already starts with", () => {
    const own = `SANTOS ${TP}`;
    expect(shortcutInsertText("SANTOS", own, "")).toBe(own);
  });

  it("with no person target the expansion alone goes in", () => {
    expect(shortcutInsertText(null, TP, "")).toBe(TP);
    expect(shortcutInsertText(null, TP, "He stopped. ")).toBe(TP);
  });

  it("nothing to insert for an empty expansion", () => {
    expect(shortcutInsertText("SANTOS", "  ", "")).toBeNull();
    expect(shortcutInsertText("SANTOS", null, "x")).toBeNull();
  });

  it("knows where a sentence ends", () => {
    expect(startsNewSentence("")).toBe(true);
    expect(startsNewSentence("It ended.")).toBe(true);
    expect(startsNewSentence('He said "stop." ')).toBe(true);
    expect(startsNewSentence("It is continuing")).toBe(false);
    expect(startsNewSentence("went to ")).toBe(false);
  });
});
