import { describe, expect, it } from "vitest";
import {
  aggregateWeeklyIntel,
  buildSheetIntel,
  highlightSegments,
  intelByCategory,
  whoWhatClause,
} from "../shared/sheetIntel";

const rows = [
  {
    id: 11,
    time: "10:05 AM",
    timeMinutes: 605,
    observation:
      "VALE, FRASER and WATANABE exited the vehicle, FRASER went to the boot retrieved the brown suitcase.",
  },
  {
    id: 12,
    time: "09:40 AM",
    timeMinutes: 580,
    observation: "FRASER walked to the Westpac ATM, withdrew cash and left.",
  },
  {
    id: 13,
    time: "11:30 AM",
    timeMinutes: 690,
    observation:
      "WATANABE exited The Ritz-Carlton carrying a black suitcase. VALE and FRASER spoke with a male.",
  },
  { id: 14, time: null, timeMinutes: null, observation: "Nil sighted." },
];

describe("buildSheetIntel", () => {
  it("lists the cues in time order with straight counts for the same item", () => {
    const lines = buildSheetIntel({ rows });
    expect(lines.map(l => `${l.rowId}:${l.heading}`)).toEqual([
      "12:ATM withdrawal",
      "11:Brown suitcase",
      "13:Black suitcase",
    ]);
    // a brown and a black suitcase are the same item: ×2 on this sheet
    const suitcases = lines.filter(l => l.group === "suitcase");
    expect(suitcases.map(l => l.groupCount)).toEqual([2, 2]);
    expect(lines[0].groupCount).toBe(1);
  });

  it("keeps the officer's own sentence, unchanged", () => {
    const l = buildSheetIntel({ rows })[1];
    expect(l.sentence).toBe(
      "VALE, FRASER and WATANABE exited the vehicle, FRASER went to the boot retrieved the brown suitcase."
    );
  });

  it("does not list a plain 'spoke with'", () => {
    const lines = buildSheetIntel({ rows });
    expect(lines.some(l => l.heading === "Met / spoke with")).toBe(false);
  });

  it("an unticked line stays in the list, marked not included, and keeps its key after a typo fix", () => {
    const first = buildSheetIntel({ rows });
    const key = first[1].key;
    const hidden = buildSheetIntel({ rows, hiddenKeys: [key] });
    expect(hidden.find(l => l.key === key)!.included).toBe(false);
    expect(hidden.filter(l => l.included)).toHaveLength(2);
    // the officer fixes a word in the sentence — same row, same item, same key
    const fixed = rows.map(r =>
      r.id === 11
        ? { ...r, observation: r.observation.replace("went", "walked") }
        : r
    );
    const again = buildSheetIntel({ rows: fixed, hiddenKeys: [key] });
    expect(again.find(l => l.key === key)!.included).toBe(false);
  });

  it("two of the same item in one row get separate keys", () => {
    const lines = buildSheetIntel({
      rows: [
        {
          id: 1,
          timeMinutes: 600,
          observation: "FRASER carried a bag. WATANABE carried a bag.",
        },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map(l => l.key)).size).toBe(2);
    expect(lines.map(l => l.groupCount)).toEqual([2, 2]);
  });

  it("hand-added lines show who added them, count like the others and are always included", () => {
    const lines = buildSheetIntel({
      rows,
      manualLines: [
        {
          id: 5,
          category: "items",
          heading: "Suitcase",
          text: "Seen by 4A1 loading a suitcase into a taxi.",
          time: "12:10 PM",
          timeMinutes: 730,
          addedByCIN: "4A1",
        },
        {
          id: 6,
          category: "nonsense",
          heading: "x",
          text: "y",
          addedByCIN: "4A1",
        },
      ],
      hiddenKeys: ["m5"],
    });
    const m = lines.find(l => l.source === "manual")!;
    expect(m.addedByCIN).toBe("4A1");
    expect(m.included).toBe(true);
    expect(m.groupCount).toBe(3); // the two automatic suitcases + this one
    expect(lines).toHaveLength(4); // the unknown category is dropped
    expect(lines[lines.length - 1]).toBe(m);
  });

  it("a row with nothing gives nothing", () => {
    expect(buildSheetIntel({ rows: [rows[3]] })).toEqual([]);
    expect(buildSheetIntel({ rows: [] })).toEqual([]);
  });

  it("groups by category in the screen order", () => {
    const g = intelByCategory(buildSheetIntel({ rows }));
    expect(g.map(x => x.label)).toEqual(["Items carried", "Money"]);
  });
});

describe("highlightSegments", () => {
  it("picks out the matched words whatever the capitals", () => {
    expect(
      highlightSegments("FRASER carried a Brown Suitcase.", "brown suitcase")
    ).toEqual([
      { text: "FRASER carried a ", hit: false },
      { text: "Brown Suitcase", hit: true },
      { text: ".", hit: false },
    ]);
  });
  it("highlights nothing when the words are gone or empty", () => {
    expect(highlightSegments("abc", "xyz")).toEqual([
      { text: "abc", hit: false },
    ]);
    expect(highlightSegments("abc", "")).toEqual([{ text: "abc", hit: false }]);
  });
});

describe("whoWhatClause", () => {
  it("takes the clause that holds the cue, word for word", () => {
    expect(
      whoWhatClause(
        "VALE, FRASER and WATANABE exited the vehicle, FRASER went to the boot retrieved the brown suitcase.",
        "brown suitcase"
      )
    ).toBe(
      "VALE, FRASER and WATANABE exited the vehicle, FRASER went to the boot retrieved the brown suitcase"
    );
  });
  it("cuts at 'and' + a new action, and at 'then'", () => {
    expect(
      whoWhatClause(
        "FRASER walked to the Westpac ATM, withdrew cash and returned to the vehicle.",
        "withdrew cash"
      )
    ).toBe("FRASER walked to the Westpac ATM, withdrew cash");
    expect(
      whoWhatClause("The male withdrew cash then drove off.", "withdrew cash")
    ).toBe("The male withdrew cash");
  });
  it("does not leave a dangling comma where it cut", () => {
    expect(
      whoWhatClause(
        "FRASER retrieved the brown suitcase from the boot, then drove off.",
        "brown suitcase"
      )
    ).toBe("FRASER retrieved the brown suitcase from the boot");
  });
  it("still says what happened when nobody is named", () => {
    expect(
      whoWhatClause("A male carried a black bag to the car.", "black bag")
    ).toBe("A male carried a black bag to the car");
  });
  it("clips very long sentences", () => {
    const long = "word ".repeat(80) + "carried a bag";
    expect(whoWhatClause(long, "a bag").length).toBeLessThanOrEqual(161);
  });
});

describe("aggregateWeeklyIntel", () => {
  it("adds up straight counts and the days, one line per item", () => {
    const items = aggregateWeeklyIntel([
      {
        category: "items",
        heading: "Brown suitcase",
        group: "suitcase",
        sentence: "FRASER retrieved the brown suitcase from the boot.",
        matched: "brown suitcase",
        date: "2026-11-03",
      },
      {
        category: "items",
        heading: "Black suitcase",
        group: "suitcase",
        sentence: "WATANABE carried a black suitcase.",
        matched: "black suitcase",
        date: "2026-11-05",
      },
      {
        category: "items",
        heading: "Black suitcase",
        group: "suitcase",
        sentence: "WATANABE carried a black suitcase.",
        matched: "black suitcase",
        date: "2026-11-05",
      },
      {
        category: "money",
        heading: "ATM withdrawal",
        group: "ATM withdrawal",
        sentence: "FRASER withdrew cash at the ATM.",
        matched: "withdrew cash",
        date: "2026-11-04",
      },
    ]);
    expect(items.map(i => [i.heading, i.count, i.dates])).toEqual([
      ["Brown suitcase", 3, ["2026-11-03", "2026-11-05"]],
      ["ATM withdrawal", 1, ["2026-11-04"]],
    ]);
    // the grey line comes from the earliest occurrence
    expect(items[0].line).toBe(
      "FRASER retrieved the brown suitcase from the boot"
    );
  });

  it("marks an item as hand-added only when every line of it was", () => {
    const base = {
      category: "items" as const,
      heading: "Laptop",
      group: "laptop",
      matched: "",
    };
    const only = aggregateWeeklyIntel([
      {
        ...base,
        sentence: "Laptop seen in the bag.",
        date: "2026-11-03",
        addedByCIN: "4A1",
      },
    ]);
    expect(only[0].addedByCIN).toBe("4A1");
    expect(only[0].line).toBe("Laptop seen in the bag.");
    const mixed = aggregateWeeklyIntel([
      {
        ...base,
        sentence: "Laptop seen in the bag.",
        date: "2026-11-03",
        addedByCIN: "4A1",
      },
      {
        ...base,
        sentence: "FRASER carried a laptop.",
        matched: "a laptop",
        date: "2026-11-04",
      },
    ]);
    expect(mixed[0].addedByCIN).toBeUndefined();
    expect(mixed[0].count).toBe(2);
  });
});

describe("sentences left out on purpose", () => {
  it("lists sentences that say it did not happen, or are quoted speech", async () => {
    const { leftOutOfSheet } = await import("../shared/sheetIntel");
    const out = leftOutOfSheet([
      {
        id: 1,
        time: "10:00 AM",
        observation:
          'FRASER did not use his phone. WATANABE carried a bag. VALE said "I have the cash with me" to the driver.',
      },
      { id: 2, time: "10:10 AM", observation: "No bags observed." },
      { id: 3, time: "10:20 AM", observation: "FRASER walked to the car." },
    ]);
    expect(out.map(o => [o.rowId, o.reason])).toEqual([
      [1, "negated"],
      [1, "quoted"],
      [2, "negated"],
    ]);
    expect(out[0].sentence).toBe("FRASER did not use his phone.");
  });
});

describe("weekDayBoxes", () => {
  it("lights the days of the week the item happened, Monday first", async () => {
    const { weekDayBoxes } = await import("../shared/sheetIntel");
    // 2026-11-03 is a Tuesday, 2026-11-05 a Thursday; the week starts Mon 2026-11-02
    const boxes = weekDayBoxes(["2026-11-05", "2026-11-03"]);
    expect(boxes.map(b => b.letter).join("")).toBe("MTWTFSS");
    expect(boxes[0].date).toBe("2026-11-02");
    expect(boxes.map(b => (b.on ? 1 : 0)).join("")).toBe("0101000");
  });
  it("a Sunday date belongs to the week that began the Monday before", async () => {
    const { weekDayBoxes } = await import("../shared/sheetIntel");
    const boxes = weekDayBoxes(["2026-11-08"]);
    expect(boxes[0].date).toBe("2026-11-02");
    expect(boxes[6].on).toBe(true);
  });
  it("nothing for no dates", async () => {
    const { weekDayBoxes } = await import("../shared/sheetIntel");
    expect(weekDayBoxes([])).toEqual([]);
  });
});
