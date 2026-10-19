import { describe, expect, it } from "vitest";
import {
  justTypedSpaceAfterBracket,
  tidyObservation,
  tidyObservationAtCaret,
} from "../shared/observationTidy";

const t = (s: string, final = true) => tidyObservation(s, final);

describe("tidyObservation — capitals", () => {
  it("capitalises the start of the observation", () => {
    expect(t("haddad exited the shop.")).toBe("Haddad exited the shop.");
  });

  it("capitalises after a full stop, '!' and '?'", () => {
    expect(t("She left. he followed. then he stopped")).toBe(
      "She left. He followed. Then he stopped."
    );
    expect(t("Who is that? she asked. Go! then left")).toBe(
      "Who is that? She asked. Go! Then left."
    );
  });

  it("capitalises the start of each new line", () => {
    expect(t("She left.\nhe followed.")).toBe("She left.\nHe followed.");
  });

  it("a sentence that opens with a colour is not capitalised — a full vehicle gets 'A' instead, colours stay lower case", () => {
    expect(
      t(
        "white Lexus NX350h, bearing WA registration 1TDM414 (Vehicle 1TDM414) parked up"
      )
    ).toBe(
      "A white Lexus NX350h, bearing WA registration 1TDM414 (Vehicle 1TDM414) parked up."
    );
    expect(t("white ute was seen")).toBe("white ute was seen.");
  });

  it("leaves a rego, a number or a word with a capital inside alone", () => {
    expect(t("It left. 1TDM414 was seen. iPhone used")).toBe(
      "It left. 1TDM414 was seen. iPhone used."
    );
  });

  it("doesn't capitalise after an abbreviation, a decimal, an initial or inside a bracket", () => {
    expect(t("Stayed approx. five minutes")).toBe(
      "Stayed approx. five minutes."
    );
    expect(t("Spoke to J. smith there")).toBe("Spoke to J. smith there.");
    expect(t("Arrived at 7.55 am then left")).toBe(
      "Arrived at 7.55 am then left."
    );
    expect(t("Entered (the Blend Cafe. north side) then left")).toBe(
      "Entered (the Blend Cafe. north side) then left."
    );
  });

  it("never lower-cases anything", () => {
    expect(t("HADDAD PHOTOGRAPH/S TAKEN. Out of sight")).toBe(
      "HADDAD PHOTOGRAPH/S TAKEN. Out of sight."
    );
  });
});

describe("tidyObservation — spaces", () => {
  it("makes it one space between words", () => {
    expect(t("She  left   the shop")).toBe("She left the shop.");
  });

  it("adds the missing space after a comma, but not inside a number", () => {
    expect(t("She left,then returned")).toBe("She left, then returned.");
    expect(t("Paid $1,000 cash")).toBe("Paid $1,000 cash.");
  });

  it("leaves line breaks and a trailing space alone", () => {
    expect(t("She left.\n\nHe stayed. ", false)).toBe(
      "She left.\n\nHe stayed. "
    );
  });
});

describe("tidyObservation — the closing full stop", () => {
  it("adds one at the end when finishing", () => {
    expect(t("She left the shop")).toBe("She left the shop.");
    expect(t("Entered (Blend Cafe)")).toBe("Entered (Blend Cafe).");
    expect(t("She left the shop  ")).toBe("She left the shop.  ");
  });

  it("is not added while still typing", () => {
    expect(t("She left the shop", false)).toBe("She left the shop");
  });

  it("is not added when the text already ends in punctuation", () => {
    expect(t("She left.")).toBe("She left.");
    expect(t("Continued via:")).toBe("Continued via:");
    expect(t("What next?")).toBe("What next?");
  });

  it("is not added to a single word, or the special 'tv' trigger", () => {
    expect(t("tv")).toBe("tv");
    expect(t("TV")).toBe("TV");
    expect(t("OOS")).toBe("OOS");
  });
});

describe("tidyObservation — together, and with vehicle lists", () => {
  it("does vehicle lists and the tidy-up in one pass", () => {
    const L =
      "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
    const K =
      "white Toyota Kluger station sedan, bearing WA registration 1TMD414 (Vehicle 1TMD414)";
    expect(t(`haddad arrived in ${L} ${K} parked  up`)).toBe(
      `Haddad arrived in a ${L} and a ${K} parked up.`
    );
  });

  it("is idempotent", () => {
    const once = t("haddad  exited,then entered the shop. he left");
    expect(t(once)).toBe(once);
  });

  it("leaves a well-formed observation exactly as it is", () => {
    const ok =
      "HADDAD, carrying a Woolworths bag, exited Woolworths Southlands, 45 Burrendah Boulevard, WILLETON WA (Woolworths Southlands) where she ordered food.";
    expect(t(ok)).toBe(ok);
    expect(t("PHOTOGRAPH/S TAKEN.")).toBe("PHOTOGRAPH/S TAKEN.");
  });
});

describe("tidyObservationAtCaret", () => {
  it("keeps the caret in place while typing", () => {
    const text = "haddad  exited (Woolworths) ";
    const r = tidyObservationAtCaret(text, text.length, false);
    expect(r.text).toBe("Haddad exited (Woolworths) ");
    expect(r.caret).toBe(r.text.length);
    expect(r.changed).toBe(true);
  });

  it("reports no change when nothing needs tidying", () => {
    const text = "Haddad exited (Woolworths) ";
    expect(tidyObservationAtCaret(text, text.length, false)).toEqual({
      text,
      caret: text.length,
      changed: false,
    });
  });

  it("a caret before the changes doesn't move", () => {
    const r = tidyObservationAtCaret("ab  cd", 1, false);
    expect(r.caret).toBe(1);
  });
});

describe("justTypedSpaceAfterBracket", () => {
  it("is true only for a space right after a closing bracket", () => {
    expect(justTypedSpaceAfterBracket("x (Blend Cafe) ", 15)).toBe(true);
    expect(justTypedSpaceAfterBracket("x (Blend Cafe)", 14)).toBe(false);
    expect(justTypedSpaceAfterBracket("x cafe ", 7)).toBe(false);
  });
});

describe("repairing slips made while typing", () => {
  it("fixes the screenshot case: stray full stop, glued street type, doubled and", () => {
    expect(
      tidyObservation(
        "CORNELL exited the vehicle, entered. 64 Sewell Streetand and continued out of sight."
      )
    ).toBe(
      "CORNELL exited the vehicle, entered 64 Sewell Street and continued out of sight."
    );
  });

  it("removes a function word said twice running, keeping the first", () => {
    expect(tidyObservation("Walked to the the shop and and left.")).toBe(
      "Walked to the shop and left."
    );
    expect(tidyObservation("Went into the and and and shop.")).toBe(
      "Went into the and shop."
    );
  });

  it("leaves words that can legitimately repeat, and bracketed text", () => {
    expect(tidyObservation("He said that that was so.")).toBe(
      "He said that that was so."
    );
    expect(tidyObservation("Seen at (the the) shop.")).toBe(
      "Seen at (the the) shop."
    );
  });

  it("collapses double commas", () => {
    expect(tidyObservation("Walked north,, then east, , then stopped.")).toBe(
      "Walked north, then east, then stopped."
    );
  });

  it("removes a full stop in the middle of a sentence only when it is clearly a slip", () => {
    expect(tidyObservation("Walked to the. shop and left.")).toBe(
      "Walked to the shop and left."
    );
    // a real sentence end after "entered" is kept when a name follows
    expect(tidyObservation("HOGAN entered. SANTOS walked off.")).toBe(
      "HOGAN entered. SANTOS walked off."
    );
    // a number that isn't an address after "entered." is kept
    expect(tidyObservation("HOGAN entered. 2 males exited.")).toBe(
      "HOGAN entered. 2 males exited."
    );
  });

  it("keeps the caret in place when typing", () => {
    const text = "Entered the the shop";
    const r = tidyObservationAtCaret(text, text.length);
    expect(r.text).toBe("Entered the shop");
    expect(r.caret).toBe(r.text.length);
  });
});
