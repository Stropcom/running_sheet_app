import { describe, expect, it } from "vitest";
import {
  joinVehicleLists,
  joinVehicleListsAtCaret,
  justTypedSpaceAfterVehicle,
  vehicleListFixes,
} from "../shared/vehicleList";

const LEXUS =
  "White Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
const KLUGER =
  "White Toyota Kluger station sedan, bearing WA registration 1TMD414 (Vehicle 1TMD414)";
const TRANSIT =
  "Silver Ford Transit Van, bearing VIC registration TFG414 (Vehicle TFG414)";
const HILUX =
  "grey Toyota Hilux utility, bearing WA registration 1AAA111 (Vehicle 1AAA111)";

describe("joinVehicleLists", () => {
  it("puts 'and' between two vehicles", () => {
    expect(joinVehicleLists(`${LEXUS} ${KLUGER}`)).toBe(
      `${LEXUS} and ${KLUGER}`
    );
  });

  it("puts commas between, and 'and' before the last, for three (the example)", () => {
    expect(joinVehicleLists(`${LEXUS} ${KLUGER} ${TRANSIT}`)).toBe(
      `${LEXUS}, ${KLUGER} and ${TRANSIT}`
    );
  });

  it("works for four or more, with no comma before the 'and'", () => {
    expect(joinVehicleLists(`${LEXUS} ${KLUGER} ${TRANSIT} ${HILUX}`)).toBe(
      `${LEXUS}, ${KLUGER}, ${TRANSIT} and ${HILUX}`
    );
  });

  it("regularises a list that grew one vehicle at a time", () => {
    // "A and B" then C is typed straight after: becomes "A, B and C".
    expect(joinVehicleLists(`${LEXUS} and ${KLUGER} ${TRANSIT}`)).toBe(
      `${LEXUS}, ${KLUGER} and ${TRANSIT}`
    );
  });

  it("never doubles up on a list that is already punctuated", () => {
    const done = `${LEXUS}, ${KLUGER} and ${TRANSIT}`;
    expect(joinVehicleLists(done)).toBe(done);
    const two = `${LEXUS} and ${KLUGER}`;
    expect(joinVehicleLists(two)).toBe(two);
    const oxford = `${LEXUS}, ${KLUGER}, and ${TRANSIT}`;
    expect(joinVehicleLists(oxford)).toBe(oxford);
  });

  it("handles bare regos written by the Space completion", () => {
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
      "White Lexus NX350h (Vehicle NX350H) station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
    expect(joinVehicleLists(t)).toBe(t);
  });

  it("leaves a deliberate line break alone", () => {
    const t = `${LEXUS}\n${KLUGER}`;
    expect(joinVehicleLists(t)).toBe(t);
  });

  it("handles a list in the middle of a longer observation, and two separate lists", () => {
    const t = `Surveillance commenced. ${LEXUS} ${KLUGER} parked at the address. Later ${TRANSIT} ${HILUX} left.`;
    // second list: " left." follows, fine; first list ends before "parked"
    expect(joinVehicleLists(t)).toBe(
      `Surveillance commenced. ${LEXUS} and ${KLUGER} parked at the address. Later ${TRANSIT} and ${HILUX} left.`
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

describe("joinVehicleListsAtCaret", () => {
  it("keeps the caret where the officer is typing", () => {
    const text = `${LEXUS} ${KLUGER} `;
    const r = joinVehicleListsAtCaret(text, text.length);
    expect(r.changed).toBe(true);
    expect(r.text).toBe(`${LEXUS} and ${KLUGER} `);
    expect(r.caret).toBe(r.text.length);
  });

  it("doesn't move a caret that sits before the edit", () => {
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
  it("offers one fix per list needing punctuation", () => {
    const text = `Seen: ${LEXUS} ${KLUGER} ${TRANSIT} at the address.`;
    const fixes = vehicleListFixes(text);
    expect(fixes).toHaveLength(1);
    // From the first vehicle's bracket to the last.
    expect(fixes[0].wrong).toBe(`(Vehicle 1TDM414) ${KLUGER} ${TRANSIT}`);
    expect(fixes[0].correct).toBe(
      `(Vehicle 1TDM414), ${KLUGER} and ${TRANSIT}`
    );
    expect(text.replace(fixes[0].wrong, fixes[0].correct)).toBe(
      `Seen: ${LEXUS}, ${KLUGER} and ${TRANSIT} at the address.`
    );
  });

  it("offers nothing for a list that is already right", () => {
    expect(vehicleListFixes(`${LEXUS} and ${KLUGER}`)).toEqual([]);
  });
});

import { checkVehicleLists } from "./sheetCheck";

describe("checkVehicleLists", () => {
  const row = (observation: string) => ({
    rowId: 7,
    timeMinutes: 600,
    observation,
  });

  it("flags an unpunctuated list with a one-tap fix, once per list", () => {
    const text = `Seen ${LEXUS} ${KLUGER} ${TRANSIT}.`;
    const findings = checkVehicleLists([row(text)] as any);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("vehicle-list-unpunctuated");
    expect(findings[0].category).toBe("formatting");
    const fix = findings[0].suggestedFix!;
    expect(text.replace(fix.wrong, fix.correct)).toBe(
      `Seen ${LEXUS}, ${KLUGER} and ${TRANSIT}.`
    );
  });

  it("flags nothing on a punctuated list or a single vehicle", () => {
    expect(
      checkVehicleLists([row(`${LEXUS} and ${KLUGER}`), row(LEXUS)] as any)
    ).toEqual([]);
  });
});

import { normalizeObservationPunctuation } from "./db";

describe("normalizeObservationPunctuation with vehicle lists", () => {
  it("writes the list as 'A and B' without a comma before the 'and'", () => {
    expect(normalizeObservationPunctuation(`${LEXUS} ${KLUGER}`)).toBe(
      `${LEXUS} and ${KLUGER}`
    );
  });

  it("writes three as 'A, B and C'", () => {
    expect(
      normalizeObservationPunctuation(`${LEXUS} ${KLUGER} ${TRANSIT}`)
    ).toBe(`${LEXUS}, ${KLUGER} and ${TRANSIT}`);
  });

  it("is stable when saved again", () => {
    const once = normalizeObservationPunctuation(
      `${LEXUS} ${KLUGER} ${TRANSIT} parked up`
    );
    expect(normalizeObservationPunctuation(once)).toBe(once);
    expect(once).toBe(`${LEXUS}, ${KLUGER} and ${TRANSIT}, parked up`);
  });

  it("still puts the usual comma after a lone vehicle bracket", () => {
    expect(normalizeObservationPunctuation(`${LEXUS} parked up`)).toBe(
      `${LEXUS}, parked up`
    );
  });
});
