import { describe, expect, it } from "vitest";
import {
  joinVehicleLists,
  joinVehicleListsAtCaret,
  justTypedSpaceAfterVehicle,
  vehicleListFixes,
} from "../shared/vehicleList";
import { checkVehicleLists } from "./sheetCheck";
import { normalizeObservationPunctuation } from "./db";

// What an officer writes (or a chip inserts): no article in front.
const LEXUS =
  "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
const KLUGER =
  "white Toyota Kluger station sedan, bearing WA registration 1TMD414 (Vehicle 1TMD414)";
const TRANSIT =
  "silver Ford Transit Van, bearing VIC registration TFG414 (Vehicle TFG414)";
const HILUX =
  "grey Toyota Hilux utility, bearing WA registration 1AAA111 (Vehicle 1AAA111)";
const ORANGE =
  "orange Holden Commodore sedan, bearing WA registration 1OOO111 (Vehicle 1OOO111)";

// The same with its article: "A …" at the start of a sentence, "a …" after.
const cap = (v: string) => `A ${v}`;
const art = (v: string) => `a ${v}`;

describe("joinVehicleLists — punctuation", () => {
  it("puts 'and' between two vehicles", () => {
    expect(joinVehicleLists(`${LEXUS} ${KLUGER}`)).toBe(
      `${cap(LEXUS)} and ${art(KLUGER)}`
    );
  });

  it("puts commas between, and 'and' before the last, for three (the example)", () => {
    expect(joinVehicleLists(`${LEXUS} ${KLUGER} ${TRANSIT}`)).toBe(
      `${cap(LEXUS)}, ${art(KLUGER)} and ${art(TRANSIT)}`
    );
  });

  it("works for four or more, with no comma before the 'and'", () => {
    expect(joinVehicleLists(`${LEXUS} ${KLUGER} ${TRANSIT} ${HILUX}`)).toBe(
      `${cap(LEXUS)}, ${art(KLUGER)}, ${art(TRANSIT)} and ${art(HILUX)}`
    );
  });

  it("regularises a list that grew one vehicle at a time", () => {
    expect(
      joinVehicleLists(`${cap(LEXUS)} and ${art(KLUGER)} ${TRANSIT}`)
    ).toBe(`${cap(LEXUS)}, ${art(KLUGER)} and ${art(TRANSIT)}`);
  });

  it("never doubles up on a list that is already right", () => {
    const done = `${cap(LEXUS)}, ${art(KLUGER)} and ${art(TRANSIT)}`;
    expect(joinVehicleLists(done)).toBe(done);
    const two = `${cap(LEXUS)} and ${art(KLUGER)}`;
    expect(joinVehicleLists(two)).toBe(two);
    const oxford = `${cap(LEXUS)}, ${art(KLUGER)}, and ${art(TRANSIT)}`;
    expect(joinVehicleLists(oxford)).toBe(oxford);
  });

  it("handles bare regos written by the Space completion (no description, no article)", () => {
    expect(
      joinVehicleLists("1ABC123 (Vehicle 1ABC123) 1XYZ789 (Vehicle 1XYZ789)")
    ).toBe("1ABC123 (Vehicle 1ABC123) and 1XYZ789 (Vehicle 1XYZ789)");
    expect(joinVehicleLists("(Vehicle 1ABC123) (Vehicle 1XYZ789)")).toBe(
      "(Vehicle 1ABC123) and (Vehicle 1XYZ789)"
    );
  });

  it("leaves narrative between two vehicles alone", () => {
    const t = `${LEXUS} then drove to the shop and later a Ford, bearing WA registration 1ZZZ999 (Vehicle 1ZZZ999)`;
    expect(joinVehicleLists(t)).toBe(t);
    const t2 = `${LEXUS}. ${KLUGER}`;
    expect(joinVehicleLists(t2)).toBe(t2);
    const t3 = `${LEXUS}; ${KLUGER}`;
    expect(joinVehicleLists(t3)).toBe(t3);
  });

  it("doesn't split one vehicle whose model was bracketed early", () => {
    const t =
      "white Lexus NX350h (Vehicle NX350H) station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
    expect(joinVehicleLists(t)).toBe(t);
  });

  it("leaves a deliberate line break alone", () => {
    const t = `${LEXUS}\n${KLUGER}`;
    expect(joinVehicleLists(t)).toBe(t);
  });

  it("handles two separate lists in a longer observation", () => {
    const t = `Surveillance commenced. ${LEXUS} ${KLUGER} parked at the address. Later ${TRANSIT} ${HILUX} left.`;
    expect(joinVehicleLists(t)).toBe(
      `Surveillance commenced. ${cap(LEXUS)} and ${art(KLUGER)} parked at the address. Later ${art(TRANSIT)} and ${art(HILUX)} left.`.replace(
        "Later a ",
        "Later a "
      )
    );
  });

  it("does nothing for a single vehicle or no vehicle", () => {
    expect(joinVehicleLists(LEXUS)).toBe(LEXUS);
    expect(joinVehicleLists("")).toBe("");
    expect(joinVehicleLists("Out of sight")).toBe("Out of sight");
  });

  it("is idempotent", () => {
    const once = joinVehicleLists(`${LEXUS} ${KLUGER} ${TRANSIT}`);
    expect(joinVehicleLists(once)).toBe(once);
  });
});

describe("joinVehicleLists — 'a' / 'an' in front of each vehicle", () => {
  it("gives the exact example sentence", () => {
    expect(joinVehicleLists(`${LEXUS}, ${KLUGER} and ${TRANSIT}`)).toBe(
      "A white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414), a white Toyota Kluger station sedan, bearing WA registration 1TMD414 (Vehicle 1TMD414) and a silver Ford Transit Van, bearing VIC registration TFG414 (Vehicle TFG414)"
    );
  });

  it("uses a capital 'A' only at the start of a sentence, 'a' elsewhere", () => {
    expect(joinVehicleLists(`HADDAD arrived in ${LEXUS} and ${KLUGER}.`)).toBe(
      `HADDAD arrived in ${art(LEXUS)} and ${art(KLUGER)}.`
    );
    expect(joinVehicleLists(`Seen: ${LEXUS} ${KLUGER}`)).toBe(
      `Seen: ${cap(LEXUS)} and ${art(KLUGER)}`
    );
    expect(joinVehicleLists(`Sighted. ${LEXUS} ${KLUGER}`)).toBe(
      `Sighted. ${cap(LEXUS)} and ${art(KLUGER)}`
    );
  });

  it("uses 'an' before a vowel sound", () => {
    expect(joinVehicleLists(`${ORANGE} ${HILUX}`)).toBe(
      `An ${ORANGE} and ${art(HILUX)}`
    );
    expect(joinVehicleLists(`${HILUX} ${ORANGE}`)).toBe(
      `${cap(HILUX)} and an ${ORANGE}`
    );
  });

  it("writes the colour in lower case when it adds the article", () => {
    expect(
      joinVehicleLists(
        "White Lexus, bearing WA registration 1TDM414 (Vehicle 1TDM414) Silver Ford Van, bearing WA registration TFG414 (Vehicle TFG414)"
      )
    ).toBe(
      "A white Lexus, bearing WA registration 1TDM414 (Vehicle 1TDM414) and a silver Ford Van, bearing WA registration TFG414 (Vehicle TFG414)"
    );
  });

  it("does not double an article that is already there", () => {
    const t = `the ${LEXUS} and an ${ORANGE}`;
    expect(joinVehicleLists(t)).toBe(t);
  });

  it("leaves narrative before the description alone", () => {
    expect(
      joinVehicleLists(`HADDAD in grey jumper drove ${LEXUS} ${KLUGER}`)
    ).toBe(`HADDAD in grey jumper drove ${art(LEXUS)} and ${art(KLUGER)}`);
  });

  it("adds nothing to a single vehicle", () => {
    expect(joinVehicleLists(`${LEXUS} parked up`)).toBe(`${LEXUS} parked up`);
  });

  it("gives a vehicle with no description no article", () => {
    expect(joinVehicleLists(`${LEXUS} 1XYZ789 (Vehicle 1XYZ789)`)).toBe(
      `${cap(LEXUS)} and 1XYZ789 (Vehicle 1XYZ789)`
    );
  });
});

describe("joinVehicleListsAtCaret", () => {
  it("keeps the caret where the officer is typing", () => {
    const text = `${LEXUS} ${KLUGER} `;
    const r = joinVehicleListsAtCaret(text, text.length);
    expect(r.changed).toBe(true);
    expect(r.text).toBe(`${cap(LEXUS)} and ${art(KLUGER)} `);
    expect(r.caret).toBe(r.text.length);
  });

  it("doesn't move a caret that sits before the edits", () => {
    const text = `Obs: ${LEXUS} ${KLUGER}`;
    const r = joinVehicleListsAtCaret(text, 3);
    expect(r.caret).toBe(3);
  });

  it("reports no change when there is nothing to do", () => {
    const r = joinVehicleListsAtCaret(LEXUS, 5);
    expect(r).toEqual({ text: LEXUS, caret: 5, changed: false });
  });
});

describe("justTypedSpaceAfterVehicle", () => {
  it("is true only for a space right after a vehicle bracket", () => {
    expect(justTypedSpaceAfterVehicle("x (Vehicle 1ABC123) ", 20)).toBe(true);
    expect(justTypedSpaceAfterVehicle("x (Vehicle 1ABC123)", 19)).toBe(false);
    expect(justTypedSpaceAfterVehicle("x (Person ABC) ", 15)).toBe(false);
  });
});

describe("vehicleListFixes (Check Sheet)", () => {
  it("offers one fix per list needing tidying", () => {
    const text = `Seen: ${LEXUS} ${KLUGER} ${TRANSIT} at the address.`;
    const fixes = vehicleListFixes(text);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].needsPunctuation).toBe(true);
    expect(fixes[0].needsArticles).toBe(true);
    expect(text.replace(fixes[0].wrong, fixes[0].correct)).toBe(
      `Seen: ${cap(LEXUS)}, ${art(KLUGER)} and ${art(TRANSIT)} at the address.`
    );
  });

  it("flags a punctuated list that only lacks its articles", () => {
    const text = `${LEXUS} and ${KLUGER}`;
    const fixes = vehicleListFixes(text);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].needsPunctuation).toBe(false);
    expect(fixes[0].needsArticles).toBe(true);
    expect(text.replace(fixes[0].wrong, fixes[0].correct)).toBe(
      `${cap(LEXUS)} and ${art(KLUGER)}`
    );
  });

  it("offers nothing for a list that is already right", () => {
    expect(vehicleListFixes(`${cap(LEXUS)} and ${art(KLUGER)}`)).toEqual([]);
  });
});

describe("checkVehicleLists", () => {
  const row = (observation: string) => ({
    rowId: 7,
    timeMinutes: 600,
    observation,
  });

  it("flags an untidy list with a one-tap fix, once per list", () => {
    const text = `Seen ${LEXUS} ${KLUGER} ${TRANSIT}.`;
    const findings = checkVehicleLists([row(text)] as any);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("vehicle-list-unpunctuated");
    expect(findings[0].category).toBe("formatting");
    const fix = findings[0].suggestedFix!;
    expect(text.replace(fix.wrong, fix.correct)).toBe(
      `Seen ${art(LEXUS)}, ${art(KLUGER)} and ${art(TRANSIT)}.`
    );
  });

  it("says what is missing", () => {
    const f = checkVehicleLists([row(`${LEXUS} and ${KLUGER}`)] as any);
    expect(f[0].reason).toContain("a");
    expect(f[0].reason).toContain("in front");
  });

  it("flags nothing on a tidy list or a single vehicle", () => {
    expect(
      checkVehicleLists([
        row(`${cap(LEXUS)} and ${art(KLUGER)}`),
        row(LEXUS),
      ] as any)
    ).toEqual([]);
  });
});

describe("normalizeObservationPunctuation with vehicle lists", () => {
  it("writes the list as 'A and B' without a comma before the 'and'", () => {
    expect(normalizeObservationPunctuation(`${LEXUS} ${KLUGER}`)).toBe(
      `${cap(LEXUS)} and ${art(KLUGER)}`
    );
  });

  it("writes three as 'A, B and C'", () => {
    expect(
      normalizeObservationPunctuation(`${LEXUS} ${KLUGER} ${TRANSIT}`)
    ).toBe(`${cap(LEXUS)}, ${art(KLUGER)} and ${art(TRANSIT)}`);
  });

  it("is stable when saved again", () => {
    const once = normalizeObservationPunctuation(
      `${LEXUS} ${KLUGER} ${TRANSIT} parked up`
    );
    expect(normalizeObservationPunctuation(once)).toBe(once);
    expect(once).toBe(
      `${cap(LEXUS)}, ${art(KLUGER)} and ${art(TRANSIT)}, parked up`
    );
  });

  it("still puts the usual comma after a lone vehicle bracket", () => {
    expect(normalizeObservationPunctuation(`${LEXUS} parked up`)).toBe(
      `${LEXUS}, parked up`
    );
  });
});
