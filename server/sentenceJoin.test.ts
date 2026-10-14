import { describe, it, expect } from "vitest";
import { applyEdits } from "../shared/vehicleList";
import { sentenceJoinEdits, wholeSentenceChips } from "../shared/sentenceJoin";
import {
  tidyObservation,
  tidyObservationAtCaret,
} from "../shared/observationTidy";

const j = (text: string, sentenceChips: string[] = []) => {
  const edits = sentenceJoinEdits(text, { sentenceChips });
  return edits.length ? applyEdits(text, edits) : text;
};

const HBF = "7/31 Marine Parade, COTTESLOE WA (7/31 Marine Parade)";
const TGT = "Leila Samira HADDAD, born 14 April 1988 (HADDAD)";
const NAJJAR = "Karim Elias NAJJAR, born 2 May 1985 (NAJJAR)";

describe("full stop between two whole sentences", () => {
  it("adds a full stop after a whole-sentence chip followed by a capital", () => {
    expect(j("Out of sight Surveillance ceased")).toBe(
      "Out of sight. Surveillance ceased"
    );
    expect(j("Surveillance ceased PHOTOGRAPH/S TAKEN")).toBe(
      "Surveillance ceased. PHOTOGRAPH/S TAKEN"
    );
    expect(j(`Continued out of sight Vehicle 1TDM414 arrived`)).toBe(
      "Continued out of sight. Vehicle 1TDM414 arrived"
    );
  });
  it("does it after a sentence that follows an address", () => {
    expect(j(`${HBF} Out of sight Surveillance ceased`)).toBe(
      `${HBF} Out of sight. Surveillance ceased`
    );
  });
  it("leaves it alone when a joining word, lower case, a digit or punctuation follows", () => {
    expect(j("Out of sight and returned")).toBe("Out of sight and returned");
    expect(j("Out of sight then Vehicle")).toBe("Out of sight then Vehicle");
    expect(j("Out of sight at 0930 hrs")).toBe("Out of sight at 0930 hrs");
    expect(j("Out of sight 0930 hrs")).toBe("Out of sight 0930 hrs");
    expect(j("Out of sight. Surveillance ceased")).toBe(
      "Out of sight. Surveillance ceased"
    );
    expect(j("Out of sight, Surveillance ceased")).toBe(
      "Out of sight, Surveillance ceased"
    );
    expect(j("Out of sight")).toBe("Out of sight");
  });
  it("only fires for a phrase on the list, plus the officer's own whole-sentence chips", () => {
    expect(j("Male seated Vehicle 1ABC")).toBe("Male seated Vehicle 1ABC");
    expect(j("Male seated Vehicle 1ABC", ["Male seated"])).toBe(
      "Male seated. Vehicle 1ABC"
    );
  });
  it("ignores a phrase inside a bracket", () => {
    expect(j("(Out of sight Vehicle)")).toBe("(Out of sight Vehicle)");
  });
});

describe("wholeSentenceChips", () => {
  it("keeps plain capitalised phrases and drops fragments, entities and blanks", () => {
    expect(
      wholeSentenceChips([
        "Surveillance commenced",
        "PHOTOGRAPH/S TAKEN",
        "arrived and",
        "driver and sole occupant",
        "Surveillance ceased at",
        TGT,
        HBF,
        "walked [route] towards [location]",
        "Out",
        "",
        null,
      ])
    ).toEqual(["Surveillance commenced", "PHOTOGRAPH/S TAKEN"]);
  });
});

describe('"at" before an address', () => {
  it("adds at after Surveillance commenced / ceased when an address follows", () => {
    expect(j(`Surveillance commenced ${HBF}`)).toBe(
      `Surveillance commenced at ${HBF}`
    );
    expect(j("Surveillance ceased 45 Burrendah Boulevard, WILLETON")).toBe(
      "Surveillance ceased at 45 Burrendah Boulevard, WILLETON"
    );
  });
  it("leaves it alone when it is not an address or at is already there", () => {
    expect(j("Surveillance commenced 0900 hrs")).toBe(
      "Surveillance commenced 0900 hrs"
    );
    expect(j("Surveillance commenced at 7/31 Marine Parade")).toBe(
      "Surveillance commenced at 7/31 Marine Parade"
    );
    expect(j("Surveillance commenced")).toBe("Surveillance commenced");
    expect(j("Surveillance commenced Southlands")).toBe(
      "Surveillance commenced Southlands"
    );
  });
});

describe("and / commas between people", () => {
  it("joins two people introduced one after another", () => {
    expect(j(`${TGT} ${NAJJAR}`)).toBe(`${TGT} and ${NAJJAR}`);
    expect(
      j("Seen Leila Samira HADDAD (HADDAD) Karim Elias NAJJAR (NAJJAR)")
    ).toBe("Seen Leila Samira HADDAD (HADDAD) and Karim Elias NAJJAR (NAJJAR)");
  });
  it("makes three a list, and tidies a list that grew a person at a time", () => {
    expect(
      j("Ann Lee SMITH (SMITH) Bob Ray JONES (JONES) Cal Dee WONG (WONG)")
    ).toBe(
      "Ann Lee SMITH (SMITH), Bob Ray JONES (JONES) and Cal Dee WONG (WONG)"
    );
    expect(
      j("Ann Lee SMITH (SMITH) and Bob Ray JONES (JONES) Cal Dee WONG (WONG)")
    ).toBe(
      "Ann Lee SMITH (SMITH), Bob Ray JONES (JONES) and Cal Dee WONG (WONG)"
    );
  });
  it("leaves a punctuated list, and anything with words between, alone", () => {
    const ok =
      "Ann Lee SMITH (SMITH), Bob Ray JONES (JONES) and Cal Dee WONG (WONG)";
    expect(j(ok)).toBe(ok);
    expect(j("Ann Lee SMITH (SMITH) met Bob Ray JONES (JONES)")).toBe(
      "Ann Lee SMITH (SMITH) met Bob Ray JONES (JONES)"
    );
    expect(j("Ann Lee SMITH (SMITH). Bob Ray JONES (JONES)")).toBe(
      "Ann Lee SMITH (SMITH). Bob Ray JONES (JONES)"
    );
    expect(j("Ann Lee SMITH (SMITH)\nBob Ray JONES (JONES)")).toBe(
      "Ann Lee SMITH (SMITH)\nBob Ray JONES (JONES)"
    );
  });
  it("does not treat a capitalised sentence opener as a given name", () => {
    expect(j("Ann Lee SMITH (SMITH) Then Bob Ray JONES (JONES)")).toBe(
      "Ann Lee SMITH (SMITH) Then Bob Ray JONES (JONES)"
    );
  });
  it("needs a given name — a bare SURNAME (SURNAME) is not joined", () => {
    expect(j("HADDAD (HADDAD) NAJJAR (NAJJAR)")).toBe(
      "HADDAD (HADDAD) NAJJAR (NAJJAR)"
    );
  });
});

describe("in the tidy-up pass", () => {
  it("joins and tidies together, in one pass", () => {
    expect(
      tidyObservation(
        `Surveillance commenced ${HBF} Out of sight Surveillance ceased`,
        true
      )
    ).toBe(
      `Surveillance commenced at ${HBF} Out of sight. Surveillance ceased.`
    );
  });
  it("is idempotent", () => {
    const once = tidyObservation(
      `${TGT} ${NAJJAR} Out of sight Surveillance ceased`,
      true
    );
    expect(tidyObservation(once, true)).toBe(once);
  });
  it("keeps the caret where the officer was typing", () => {
    const text = `Out of sight Surveillance ceased`;
    const caret = text.length;
    const r = tidyObservationAtCaret(text, caret, false);
    expect(r.text).toBe("Out of sight. Surveillance ceased");
    expect(r.caret).toBe(r.text.length);
  });
  it("uses the officer's own whole-sentence chips when passed in", () => {
    expect(
      tidyObservation("Male seated Vehicle 1ABC", false, {
        sentenceChips: ["Male seated"],
      })
    ).toBe("Male seated. Vehicle 1ABC");
  });
  it("never touches a well-formed chip sentence or a bare tv", () => {
    const sentence =
      "Karim Elias NAJJAR (NAJJAR) exited 7/31 Marine Parade and walked [route] towards [location].";
    expect(tidyObservation(sentence, true)).toBe(sentence);
    expect(tidyObservation("tv", true)).toBe("tv");
  });
});
