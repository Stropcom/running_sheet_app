import { describe, expect, it } from "vitest";
import { findIntelCues, splitCueSentences } from "@shared/intelCues";

const headings = (t: string) =>
  findIntelCues(t).map(c => `${c.category}/${c.heading}`);

describe("intel cues: what is found", () => {
  const cases: Array<[string, string]> = [
    [
      "VALE, FRASER and WATANABE exited the vehicle, FRASER went to the boot retrieved the brown suitcase.",
      "items/Brown suitcase",
    ],
    [
      "WATANABE exited The Ritz-Carlton carrying a large black backpack.",
      "items/Large black backpack",
    ],
    ["BAIG loaded two cardboard boxes into the boot.", "items/Cardboard boxes"],
    ["TAN carried a plastic bag into the shop.", "items/Plastic bag"],
    ["NGUYEN placed a bag in the boot of Vehicle 1XYZ123.", "items/Bag"],
    [
      "VALE using a mobile phone while walking towards Vehicle 1VAL75.",
      "devices/Mobile phone",
    ],
    [
      "VALE took a second mobile phone from his jacket pocket.",
      "devices/Second mobile phone",
    ],
    [
      "JORDAN was on a phone call while waiting at the lights.",
      "devices/Phone call",
    ],
    ["PARK sent a text message at the lights.", "devices/Messaging"],
    ["HOGAN used a pay phone outside the shop.", "devices/Public phone"],
    [
      "FRASER walked to the Westpac ATM, withdrew cash and returned to the vehicle.",
      "money/ATM withdrawal",
    ],
    ["SIMPSON withdrew $500 from the ATM.", "money/ATM withdrawal"],
    [
      "WATANABE entered the bank and deposited cash at the counter.",
      "money/Deposit",
    ],
    ["SMITH counted a roll of cash on the bonnet.", "money/Cash on hand"],
    ["UM1 handed a small package to VALE.", "meetings/Hand-over / exchange"],
    [
      "The unidentified male handed an envelope to VALE.",
      "meetings/Hand-over / exchange",
    ],
    ["VALE and FRASER shook hands.", "meetings/Greeting (handshake / embrace)"],
    [
      "VALE looked over his shoulder and checked the rear-view mirror.",
      "behaviour/Checking surroundings",
    ],
    [
      "Vehicle 1ABC123 performed a U-turn on Canning Highway.",
      "behaviour/Doubled back / circled",
    ],
    [
      "VALE changed his jacket in the car park.",
      "behaviour/Changed vehicle / appearance",
    ],
  ];
  it.each(cases)("%s", (text, expected) => {
    expect(headings(text)).toContain(expected);
  });

  it("a hand-over also gives the item that was handed over", () => {
    const h = headings("The unidentified male handed an envelope to VALE.");
    expect(h).toContain("items/Envelope");
    expect(h).toContain("meetings/Hand-over / exchange");
  });

  it("a phone call is one cue, not a call plus a phone", () => {
    expect(headings("JORDAN was on a phone call while waiting.")).toEqual([
      "devices/Phone call",
    ]);
  });

  it("walking to an ATM and withdrawing cash is one cue", () => {
    expect(
      headings("FRASER walked to the Westpac ATM, withdrew cash and left.")
    ).toEqual(["money/ATM withdrawal"]);
  });

  it("the cue carries the whole sentence it came from", () => {
    const [c] = findIntelCues(
      "VALE arrived at the shop. FRASER went to the boot retrieved the brown suitcase."
    );
    expect(c.sentence).toBe(
      "FRASER went to the boot retrieved the brown suitcase."
    );
  });
});

describe("intel cues: what is NOT found", () => {
  const none = [
    "VALE did not use his phone at the lights.",
    "No bags were observed.",
    'FRASER said "I have the cash with me" to the driver.',
    "Vehicle 5DFX162, PRICE driver, arrived at Westpac Branch, 186 Cockburn Lane, CLARKSON WA (186 Cockburn Lane).",
    "VALE walked past the phone box on Canning Highway.",
    "VALE posted a letter in the post box.",
    "Observed an ATM at the front of the shopping centre.",
    "VALE arrived at Westpac ATM, 12 Canning Highway, SOUTH PERTH WA (Westpac ATM).",
    "In case of an emergency the team will withdraw.",
    "Vehicle 7SUE651, unseen occupant/s, departed 42 Marine Street and continued via:",
    "VALE exited the vehicle and entered 15 Victoria Street.",
    "Surveillance commenced in the vicinity of Box Hill Road.",
    "VALE, FRASER and WATANABE walked in the front gate of 15 Victoria Street and continued out of sight.",
    "The phone rang and he ignored it, no call was made.",
  ];
  it.each(none)("%s", text => {
    expect(findIntelCues(text)).toEqual([]);
  });
});

describe("intel cues: doubt and strength", () => {
  it("unsure wording still gives the cue but marks it doubtful", () => {
    const c = findIntelCues(
      "FRASER appeared to place an item in the boot of 1VAL75."
    );
    expect(c.length).toBeGreaterThan(0);
    expect(c.every(x => x.doubtful)).toBe(true);
    expect(findIntelCues("WATANABE possibly carried a bag.")[0].doubtful).toBe(
      true
    );
  });
  it("plain wording is not doubtful", () => {
    expect(findIntelCues("FRASER carried a bag.")[0].doubtful).toBe(false);
  });
  it("a plain meeting is a low cue; an exchange is firm", () => {
    const met = findIntelCues(
      "COLLINS met with Susan FOX (FOX) outside 92 Victoria Road."
    );
    expect(met[0].strength).toBe("low");
    const ex = findIntelCues(
      "VALE met with UM1; UM1 handed a package to VALE."
    );
    expect(ex.find(c => c.category === "meetings")?.strength).toBe("firm");
  });
});

describe("splitCueSentences", () => {
  it("splits a row of several events into sentences, keeping times and numbers whole", () => {
    expect(
      splitCueSentences("Arrived at 04:04 PM. Walked in.\n\nCarried a bag.")
    ).toEqual(["Arrived at 04:04 PM.", "Walked in.", "Carried a bag."]);
  });
});

// The seven sentences found by the first trial on the real server (205 rows).
describe("intel cues: the first real-server trial", () => {
  const REAL: Array<[string, string, string]> = [
    [
      "Malcolm Hugh FRASER (FRASER) walked to Vehicle 1VAL75 and placed a brown suitcase in the boot.",
      "items/Brown suitcase",
      "suitcase",
    ],
    [
      "VALE, FRASER and WATANABE exited the vehicle, FRASER went to the boot retrieved the brown suitcase.",
      "items/Brown suitcase",
      "suitcase",
    ],
    [
      "Noah Benjamin PIKE (PIKE), placed a black suitcase in the back seat and entered Vehicle 1MIR84 as front passenger.",
      "items/Black suitcase",
      "suitcase",
    ],
    [
      "Daniel Tomas IBARRA (IBARRA), place a suitcase in the boot, then entered Vehicle 1MEN83 via the front passenger door.",
      "items/Suitcase",
      "suitcase",
    ],
    [
      "Peter JAMES (LANGLEY), placed a blue suitcase in the boot and entered Vehicle 1MEN83 as rear passenger.",
      "items/Blue suitcase",
      "suitcase",
    ],
  ];
  it.each(REAL)("%s", (text, heading, group) => {
    const c = findIntelCues(text).find(
      x => `${x.category}/${x.heading}` === heading
    );
    expect(c).toBeTruthy();
    expect(c!.group).toBe(group);
    expect(c!.doubtful).toBe(false);
  });

  it("an ATM DEPOSIT of cash is a deposit, not a withdrawal (the word 'cash' is in both)", () => {
    const dep = findIntelCues(
      "TRAORE entered Commonwealth Bank East Victoria Park Branch, Shop 19 The Park Centre, 789 Albany Highway, EAST VICTORIA PARK WA (Commonwealth Bank East Victoria Park Branch) and used the ATM to deposit $5,000.00 cash in $50 notes."
    );
    expect(dep.map(c => c.heading)).toEqual(["ATM deposit"]);
    const dep2 = findIntelCues(
      "VALE used the ATM closest to the entrance door to deposit a number of $50.00 notes into the machine."
    );
    expect(dep2.map(c => c.heading)).toEqual(["ATM deposit"]);
  });

  it("a withdrawal of cash is still a withdrawal", () => {
    expect(
      findIntelCues("SIMPSON used the ATM to withdraw $500.00 cash.").map(
        c => c.heading
      )
    ).toEqual(["ATM withdrawal"]);
  });

  it("repeats group by the item: brown, black and blue suitcases are one suitcase", () => {
    const groups = new Set(
      [
        "FRASER placed a brown suitcase in the boot.",
        "PIKE placed a black suitcase in the back seat.",
        "LANGLEY placed a blue suitcases in the boot.",
      ].flatMap(t => findIntelCues(t).map(c => c.group))
    );
    expect(Array.from(groups)).toEqual(["suitcase"]);
  });
});
