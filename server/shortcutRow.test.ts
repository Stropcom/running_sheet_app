import { describe, expect, it } from "vitest";
import { shortcutRowSubject, shortcutRowText } from "../shared/shortcutRow";

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
