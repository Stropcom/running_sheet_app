import { describe, expect, it } from "vitest";
import { findIntelCues } from "../shared/intelCues";
import {
  aggregateWeeklyIntel,
  buildSheetIntel,
  foldCuesInSentence,
  foldedLabel,
  highlightSegments,
} from "../shared/sheetIntel";

const lines = (obs: string[]) =>
  buildSheetIntel({
    rows: obs.map((o, i) => ({
      id: i + 1,
      time: "01:00 PM",
      timeMinutes: 780 + i,
      observation: o,
    })),
  });

const BOX =
  "SANTOS, carrying the new laptop box, exited Officeworks O'Connor, walked through the car park towards Vehicle 1EMB303 and placed the box in the rear driver's seat.";

describe("one thing in one sentence is one line", () => {
  it("'new laptop box', 'box' and the 'laptop' inside it are one line", () => {
    const l = lines([BOX]);
    expect(l.map(x => [x.category, x.heading])).toEqual([
      ["items", "New laptop box"],
    ]);
    expect(
      l[0].alsoMatched.map(a => `${a.category}:${a.matched}`).sort()
    ).toEqual(["devices:laptop", "items:box"]);
  });

  it("nothing is dropped: every cue is a leader or folded into exactly one", () => {
    for (const s of [
      BOX,
      "SANTOS, carrying the laptop box, exited the vehicle.",
      "SANTOS carried a laptop box and later used his laptop.",
      "SANTOS, carrying a red box and a blue box, entered the shop.",
      "SANTOS handed a laptop box to JONES and withdrew cash at the ATM.",
    ]) {
      const cues = findIntelCues(s);
      const folded = foldCuesInSentence(cues);
      const out = folded.flatMap(f => [f.cue, ...f.also]);
      expect(out.length).toBe(cues.length);
      expect(new Set(out)).toEqual(new Set(cues));
    }
  });

  it("the tick key of the longest wording is the one it always had", () => {
    const [l] = lines([BOX]);
    expect(l.key).toBe("1:items:box:0");
  });

  it("two different things of the same kind stay two lines", () => {
    const l = lines(["SANTOS, carrying a red box and a blue box, entered."]);
    expect(l.map(x => x.heading).sort()).toEqual(["Blue box", "Red box"]);
  });

  it("a laptop used on its own in the same sentence stays its own line", () => {
    const l = lines(["SANTOS carried a laptop box and later used his laptop."]);
    expect(l.map(x => `${x.category}:${x.heading}`).sort()).toEqual([
      "devices:Laptop",
      "items:Laptop box",
    ]);
  });

  it("a meeting or money line never absorbs an item, and is never absorbed", () => {
    const l = lines([
      "SANTOS handed a laptop box to JONES and withdrew cash at the ATM.",
    ]);
    const cats = l.map(x => x.category);
    expect(cats).toContain("items");
    expect(cats).toContain("meetings");
    expect(cats).toContain("money");
    for (const x of l)
      for (const a of x.alsoMatched)
        expect(["items", "devices"]).toContain(a.category);
  });

  it("separate rows are separate lines (same wording, different sightings)", () => {
    const l = lines([
      "SANTOS, carrying a black mobile phone, exited the vehicle.",
      "SANTOS, carrying a black mobile phone, exited the car park.",
    ]);
    expect(l).toHaveLength(2);
    expect(l.every(x => x.groupCount === 2)).toBe(true);
  });

  it("the count is per sentence, not per match", () => {
    const l = lines([BOX, "SANTOS, carrying the laptop box, entered."]);
    const box = l.filter(x => x.group === "box");
    expect(box).toHaveLength(2);
    expect(box[0].groupCount).toBe(2);
    expect(l.some(x => x.category === "devices")).toBe(false);
  });
});

describe("a phone and what is done with it is one line", () => {
  const TEXTING =
    "SANTOS exited Perth Police Station and walked towards Vehicle 1EMB303, he was holding a mobile phone and appeared to be texting, or similar.";

  it("'mobile phone' and 'texting' in one sentence are one line, on the phone", () => {
    const l = lines([TEXTING]);
    const devices = l.filter(x => x.category === "devices");
    expect(devices.map(x => x.heading)).toEqual(["Mobile phone"]);
    expect(devices[0].alsoMatched.map(a => a.heading)).toEqual(["Messaging"]);
  });

  it("a phone call with the phone is folded the same way", () => {
    const l = lines([
      "SANTOS was holding a mobile phone to his ear and appeared to be on a phone call.",
    ]).filter(x => x.category === "devices");
    expect(l.map(x => x.heading)).toEqual(["Mobile phone"]);
    expect(l[0].alsoMatched.map(a => a.heading)).toEqual(["Phone call"]);
  });

  it("two phones in the sentence: the messaging is not guessed onto either", () => {
    const l = lines([
      "SANTOS was holding a mobile phone and a second mobile phone and appeared to be texting.",
    ]).filter(x => x.category === "devices");
    // Texting stays its own line; neither phone line takes it in.
    expect(l.map(x => x.heading)).toContain("Messaging");
    for (const x of l.filter(y => /mobile phone$/i.test(y.heading)))
      expect(x.alsoMatched.map(a => a.heading)).not.toContain("Messaging");
  });

  it("texting with no phone named stays its own line", () => {
    const l = lines(["SANTOS appeared to be texting."]).filter(
      x => x.category === "devices"
    );
    expect(l.map(x => x.heading)).toEqual(["Messaging"]);
  });

  it("the same wording on two rows is still two sightings", () => {
    const l = lines([TEXTING, TEXTING]).filter(x => x.category === "devices");
    expect(l.map(x => x.heading)).toEqual(["Mobile phone", "Mobile phone"]);
  });

  it("nothing is dropped, and the phone keeps the tick key it always had", () => {
    const cues = findIntelCues(TEXTING);
    const out = foldCuesInSentence(cues).flatMap(f => [f.cue, ...f.also]);
    expect(new Set(out)).toEqual(new Set(cues));
    expect(out.length).toBe(cues.length);
    const phone = lines([TEXTING]).find(x => x.heading === "Mobile phone")!;
    expect(phone.key).toBe("1:devices:mobile phone:0");
  });
});

describe("what was folded stays visible", () => {
  it("is named for the tag, with its kind only when it differs", () => {
    const [l] = lines([BOX]);
    const labels = l.alsoMatched.map(a => foldedLabel(a, l.category)).sort();
    expect(labels).toEqual(["Box", "New laptop (Devices)"]);
  });

  it("is highlighted wherever it stands in the sentence", () => {
    const [l] = lines([BOX]);
    const hits = highlightSegments(
      l.sentence,
      l.matched,
      l.alsoMatched.map(a => a.matched)
    )
      .filter(s => s.hit)
      .map(s => s.text);
    expect(hits).toEqual(["new laptop box", "box"]);
  });

  it("highlighting without folded words is unchanged", () => {
    expect(highlightSegments("a black bag here", "black bag")).toEqual([
      { text: "a ", hit: false },
      { text: "black bag", hit: true },
      { text: " here", hit: false },
    ]);
  });

  it("the Weekly Report item lists it as 'also picked up'", () => {
    const [l] = lines([BOX]);
    const items = aggregateWeeklyIntel([
      {
        category: l.category,
        heading: l.heading,
        group: l.group,
        sentence: l.sentence,
        matched: l.matched,
        also: l.alsoMatched,
        date: "2026-11-10",
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(1);
    expect(items[0].also.sort()).toEqual(["Box", "New laptop (Devices)"]);
  });
});
