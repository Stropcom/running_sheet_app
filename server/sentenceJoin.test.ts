import { describe, it, expect } from "vitest";
import { extractEntitiesFromText } from "./db";
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

describe('"and" after "entered <place>"', () => {
  const SANTOS =
    "SANTOS exited the vehicle and walked through the car park, entered";
  it('adds "and" before lower-case "continued out of sight"', () => {
    expect(
      j(
        `${SANTOS} Crooked Spire Coffee & Art House Midland continued out of sight.`
      )
    ).toBe(
      `${SANTOS} Crooked Spire Coffee & Art House Midland and continued out of sight.`
    );
    expect(j("Entered 20 Balanus Way continued out of sight")).toBe(
      "Entered 20 Balanus Way and continued out of sight"
    );
    expect(
      j("entered 20 Balanus Way (20 Balanus Way) continued out of sight")
    ).toBe(
      "entered 20 Balanus Way (20 Balanus Way) and continued out of sight"
    );
    expect(j("entered the Bank of Perth continued out of sight")).toBe(
      "entered the Bank of Perth and continued out of sight"
    );
  });
  it('adds a full stop before a capitalised "Continued out of sight"', () => {
    expect(j("entered 20 Balanus Way Continued out of sight")).toBe(
      "entered 20 Balanus Way. Continued out of sight"
    );
  });
  it("leaves it alone when it is already joined or is not plainly a place", () => {
    for (const t of [
      "entered 20 Balanus Way and continued out of sight",
      "entered 20 Balanus Way, continued out of sight",
      "entered 20 Balanus Way. Continued out of sight",
      "entered 20 Balanus Way\ncontinued out of sight",
      "SANTOS continued out of sight",
      "Miguel Andres SANTOS (SANTOS) continued out of sight",
      "entered the car park continued out of sight",
      "entered the continued out of sight",
      "walked to 20 Balanus Way continued out of sight",
      "continued out of sight",
      "(entered 20 Balanus Way continued out of sight)",
    ])
      expect(j(t)).toBe(t);
  });
  it('only looks back to the last "entered" in the same sentence', () => {
    expect(j("entered 1 Smith Street. SANTOS continued out of sight")).toBe(
      "entered 1 Smith Street. SANTOS continued out of sight"
    );
  });
  it("runs as part of the tidy-up", () => {
    expect(
      tidyObservation(
        "SANTOS entered Crooked Spire Coffee & Art House Midland continued out of sight"
      )
    ).toBe(
      "SANTOS entered Crooked Spire Coffee & Art House Midland and continued out of sight"
    );
  });
});

describe('"A" before a full vehicle that opens a sentence', () => {
  const V =
    "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
  it("adds a capital A to a single full vehicle at the start", () => {
    expect(j(`${V}, parked and unattended at 1 Cromer Road.`)).toBe(
      `A ${V}, parked and unattended at 1 Cromer Road.`
    );
    expect(j(`Surveillance ceased. ${V}, parked.`)).toBe(
      `Surveillance ceased. A ${V}, parked.`
    );
    expect(j(`Seen\n${V}.`)).toBe(`Seen\nA ${V}.`);
  });
  it("lower-cases a capitalised colour and picks A or An", () => {
    expect(
      j(`White Lexus NX350h, bearing WA registration 1TDM414 (Vehicle 1TDM414)`)
    ).toBe(
      "A white Lexus NX350h, bearing WA registration 1TDM414 (Vehicle 1TDM414)"
    );
    expect(
      j(`orange Audi Q5, bearing WA registration 1ABC123 (Vehicle 1ABC123)`)
    ).toBe(
      "An orange Audi Q5, bearing WA registration 1ABC123 (Vehicle 1ABC123)"
    );
  });
  it("leaves it alone when there is already an article, narrative before it, or no full description", () => {
    for (const t of [
      `A ${V}, parked.`,
      `a ${V}, parked.`,
      `The ${V}, parked.`,
      `Seen leaving in ${V}.`,
      `Observed ${V}.`,
      "Vehicle 1TDM414 departed",
      "(Vehicle 1TDM414) parked",
      "Lexus NX350h, bearing WA registration 1TDM414 (Vehicle 1TDM414)",
    ])
      expect(j(t)).toBe(t);
  });
  it("does not double up with the vehicle-list rule", () => {
    const list = `${V}, a white Toyota Kluger, bearing WA registration 1TMD414 (Vehicle 1TMD414)`;
    expect(tidyObservation(list)).toBe(
      `A ${V}, a white Toyota Kluger, bearing WA registration 1TMD414 (Vehicle 1TMD414)`
    );
    // already right: left exactly as written
    expect(j(`A ${list}`)).toBe(`A ${list}`);
  });
  it("runs in the tidy-up and leaves entity extraction alone", () => {
    const text = `${V}, parked and unattended at 1 Cromer Road`;
    const ids = (t: string) =>
      extractEntitiesFromText(t)
        .map(e => `${e.type}:${e.shortForm}`)
        .sort();
    expect(tidyObservation(text)).toBe(`A ${text}`);
    expect(ids(tidyObservation(text))).toEqual(ids(text));
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

describe("entity extraction is unaffected by the joining", () => {
  const V =
    "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
  const samples = [
    `Surveillance commenced ${HBF} Out of sight Surveillance ceased`,
    `Surveillance commenced ${HBF} ${TGT} ${NAJJAR} entered ${V}`,
    `${TGT} ${NAJJAR} walked to 45 Burrendah Boulevard, WILLETON (Southlands) Out of sight Continued out of sight`,
    `Surveillance commenced 45 Burrendah Boulevard, WILLETON (45 Burrendah Boulevard) PHOTOGRAPH/S TAKEN`,
  ];
  const ids = (t: string) =>
    extractEntitiesFromText(t)
      .map(e => `${e.type}:${e.shortForm}`)
      .sort();

  it("finds the same people, vehicles and places before and after", () => {
    for (const s of samples)
      expect(ids(tidyObservation(s, true))).toEqual(ids(s));
  });

  it("a person listed after another has no joining word in their description", () => {
    const people = extractEntitiesFromText(
      tidyObservation(`${TGT} ${NAJJAR} entered`, true)
    ).filter(e => e.type === "person");
    expect(people.map(p => p.fullDescription)).toEqual([
      "Leila Samira HADDAD, born 14 April 1988",
      "Karim Elias NAJJAR, born 2 May 1985",
    ]);
  });
});
