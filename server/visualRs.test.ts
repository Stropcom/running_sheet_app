import { describe, expect, it } from "vitest";
import {
  buildVisualRs,
  ceasedFlag,
  clockMinutes,
  flagChanged,
  flagOfPosition,
  type VisualRsRow,
} from "@shared/visualRs";
import { computeRowFlags } from "./db";

const SUBJECT = { kind: "person", token: "SANTOS" } as const;
const T = (i: number) =>
  `${8 + Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")} AM`;

function flagsFor(observations: string[], roster = ["650"]) {
  const rows = observations.map((observation, i) => ({
    id: i + 1,
    sheetId: 1,
    observation,
    time: T(i * 3),
  }));
  const members = new Map<number, string[]>(rows.map(r => [r.id, roster]));
  return {
    rows,
    flags: computeRowFlags({
      rows,
      firstOwn: 0,
      own: () => true,
      membersByRow: members,
      roster,
      subject: SUBJECT,
    }),
  };
}

describe("computeRowFlags — the flag after each row", () => {
  const sheet = [
    "Surveillance commenced in the vicinity of Dental Boutique Perth, 634 Murray Street, WEST PERTH WA (Dental Boutique Perth).",
    "SANTOS entered Little Mia Cafe, 1/643 Murray Street, WEST PERTH WA (Little Mia Cafe) and continued out of sight.",
    "Nothing further observed at Little Mia Cafe.",
    "SANTOS exited Little Mia Cafe, walked towards Dental Boutique Perth.",
    "SANTOS entered Dental Boutique Perth and continued out of sight.",
    "SANTOS exited Dental Boutique Perth, stood out the front was talking on a mobile phone.",
    "SANTOS walked back to Dental Boutique Perth and continued out of sight.",
    "Surveillance ceased in the vicinity of Dental Boutique Perth.",
  ];
  const { flags } = flagsFor(sheet);

  it("starts with the Commenced flag on the commenced place", () => {
    expect(flags[0]).toMatchObject({
      kind: "commenced",
      place: "Dental Boutique Perth",
    });
    expect(flags[0]!.text).toBe("SANTOS · Commenced 8:00 AM");
  });
  it("follows him inside, out the front, back inside", () => {
    expect(flags[1]).toMatchObject({
      kind: "inside",
      place: "Little Mia Cafe",
    });
    expect(flags[2]).toMatchObject({
      kind: "inside",
      place: "Little Mia Cafe",
    });
    expect(flags[5]).toMatchObject({ label: "out the front" });
    expect(flags[6]).toMatchObject({ kind: "inside" });
  });
  it("goes grey once everyone has ceased, on the last place he was", () => {
    const last = flags[flags.length - 1]!;
    expect(last).toMatchObject({ kind: "ceased", ended: true });
    expect(last.text).toContain("ceased at");
    expect(last.place).toBe("Dental Boutique Perth");
  });
  it("has no flag for a location target or no target", () => {
    const rows = [
      { id: 1, sheetId: 1, observation: sheet[1], time: "8:00 AM" },
    ];
    for (const subject of [{ kind: "location" } as const, null]) {
      expect(
        computeRowFlags({
          rows,
          firstOwn: 0,
          own: () => true,
          membersByRow: new Map(),
          roster: [],
          subject,
        })
      ).toEqual([null]);
    }
  });
  it("only reports rows from firstOwn on (carried rows still place him)", () => {
    const rows = [
      { id: -2, sheetId: 1, observation: sheet[1], time: "7:00 AM" },
      {
        id: 5,
        sheetId: 1,
        observation: "Nothing further observed.",
        time: "7:05 AM",
      },
    ];
    const out = computeRowFlags({
      rows,
      firstOwn: 1,
      own: r => r.id > 0,
      membersByRow: new Map(),
      roster: [],
      subject: SUBJECT,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "inside", place: "Little Mia Cafe" });
  });
});

describe("buildVisualRs — frames at flag changes, text entries between", () => {
  const sheet = [
    "Surveillance commenced in the vicinity of Dental Boutique Perth, 634 Murray Street, WEST PERTH WA (Dental Boutique Perth).",
    "SANTOS entered Little Mia Cafe, 1/643 Murray Street, WEST PERTH WA (Little Mia Cafe) and continued out of sight.",
    "Nothing further observed at Little Mia Cafe.",
    "Lights on in the front room of Little Mia Cafe.",
    "SANTOS exited Little Mia Cafe, walked towards Dental Boutique Perth.",
  ];
  const { rows, flags } = flagsFor(sheet);
  const report = buildVisualRs(
    rows.map<VisualRsRow>((r, i) => ({
      rowId: r.id,
      rowNumber: i + 1,
      time: r.time,
      observation: r.observation,
      flag: flags[i],
    }))
  );
  it("makes a frame at the first placing row and at each change, an entry otherwise", () => {
    expect(report.map(i => i.kind)).toEqual([
      "frame",
      "frame",
      "entry",
      "entry",
      "frame",
    ]);
  });
  it("says what changed, and how long each frame lasted", () => {
    const [a, b, , , c] = report;
    if (a.kind !== "frame" || b.kind !== "frame" || c.kind !== "frame")
      throw new Error("expected frames");
    expect(a.why).toMatch(/first row that places the target/);
    expect(b.placeFrom).toBe("Dental Boutique Perth");
    expect(b.flagFrom).toBe("Commenced 8:00 AM");
    expect(a.dwellMinutes).toBe(3);
    expect(b.dwellMinutes).toBe(9);
    expect(c.dwellMinutes).toBeNull();
  });
  it("keeps the row text exactly as the officer wrote it", () => {
    expect(report.map(i => i.row.observation)).toEqual(sheet);
  });
  it("makes no frame for rows that place nobody", () => {
    const none = buildVisualRs([
      { rowId: 1, rowNumber: 1, time: "8:00 AM", observation: "x", flag: null },
      { rowId: 2, rowNumber: 2, time: "8:01 AM", observation: "y", flag: null },
    ]);
    expect(none.map(i => i.kind)).toEqual(["entry", "entry"]);
  });
});

describe("small rules", () => {
  it("reads clock times", () => {
    expect(clockMinutes("08:39 AM")).toBe(519);
    expect(clockMinutes("12:05 AM")).toBe(5);
    expect(clockMinutes("12:05 PM")).toBe(725);
    expect(clockMinutes("11:59 PM")).toBe(1439);
    expect(clockMinutes("nonsense")).toBeNull();
    expect(clockMinutes(null)).toBeNull();
  });
  it("a different vehicle or a different place is a flag change; wording alone is not", () => {
    const inCar = (rego: string, place: string) =>
      flagOfPosition(
        {
          place,
          state: "vehicle",
          label: `in ${rego}`,
          people: ["SANTOS"],
          rowId: 1,
          rego,
        },
        "SANTOS"
      );
    expect(
      flagChanged(
        inCar("1AAA111", "5 Smith Street"),
        inCar("1AAA111", "5 Smith St")
      )
    ).toBe(false);
    expect(
      flagChanged(
        inCar("1AAA111", "5 Smith Street"),
        inCar("1BBB222", "5 Smith Street")
      )
    ).toBe(true);
    expect(
      flagChanged(
        inCar("1AAA111", "5 Smith Street"),
        inCar("1AAA111", "9 Jones Road")
      )
    ).toBe(true);
    expect(flagChanged(null, null)).toBe(false);
    expect(ceasedFlag("SANTOS", null, null).text).toBe("SANTOS · ceased");
  });
});

describe("a long sheet stays quick", () => {
  it("works out 300 rows' flags in a few seconds", () => {
    const obs: string[] = [
      "Surveillance commenced in the vicinity of 5 Smith Street, PERTH WA (5 Smith Street).",
    ];
    for (let i = 1; i < 300; i++)
      obs.push(
        i % 3 === 0
          ? `SANTOS entered ${i} Smith Street, PERTH WA (${i} Smith Street) and continued out of sight.`
          : `Nothing further observed at the premises, a vehicle passed at ${i}.`
      );
    const started = Date.now();
    const { flags } = flagsFor(obs);
    expect(flags).toHaveLength(300);
    expect(Date.now() - started).toBeLessThan(15000);
  });
});
