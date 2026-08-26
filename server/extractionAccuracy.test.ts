/**
 * Accuracy benchmarks for extractEntitiesFromText.
 *
 * These are deliberately NOT pass/fail regression suites like
 * entityClassification.test.ts or addressFormat.test.ts (which each assert
 * one specific known behaviour). Instead they run a batch of observation
 * text against the real extraction function and report precision/recall/F1
 * across the whole batch — a genuine, reproducible accuracy number instead
 * of a guess.
 *
 * SCOPE — read this before treating a "miss" here as a real Intelligence
 * module gap: extractEntitiesFromText is the standalone, per-row bracket
 * parser. It is only ONE of the signals getAllIntelligenceEntities() uses
 * to build what the Intelligence folder actually displays. For a target or
 * associate already in the registry, that function ALSO (a) registers a
 * guaranteed occurrence on every sheet linked via runningSheets.targetId,
 * with no text-scanning involved (see the "Add formal target cards" block
 * below the initial data loads), and (b) pre-seeds each sheet's dictionary
 * with every registered target/associate alias, then re-scans every row for
 * UNBRACKETED mentions of those known aliases ("Pass B", search this file
 * for "scan every row for both bracketed AND unbracketed occurrences").
 * So a registered person can be missing their bracket in the text entirely
 * and still be tracked correctly — this benchmark will still score that as
 * a miss, because it calls extractEntitiesFromText directly and never sees
 * the sheet-level alias dictionary or the registry link. Treat a miss here
 * as "the bracket parser alone didn't catch it," not "the app got it
 * wrong" — that distinction only matters for people/vehicles/addresses NOT
 * already in the registry, which really do depend on the bracket alone.
 *
 * Two datasets:
 *  - SYNTHETIC_CASES: hand-written sentences covering the running sheet's
 *    bracket-tagging convention across every entity type, including a
 *    couple of deliberate "hard" cases the extractor is known to get
 *    wrong — included so the score reflects reality, not cherry-picked
 *    wins.
 *  - REAL_CASES: every row's observation text from real running sheet
 *    exports (Operation AMAZE, sheets 28 and 29, 2026-08-26 — user-supplied
 *    JSON exports via the Intel Export feature), hand-labelled against the
 *    actual bracketed entities each row contains. Still a small sample
 *    (two sheets, 25 rows) — a useful real-world data point, not yet a
 *    statistically robust benchmark on its own. Extend this array as more
 *    real (de-identified) running sheets are supplied.
 */
import { describe, it, expect } from "vitest";
import { extractEntitiesFromText } from "./db";

interface ExpectedEntity {
  rawShortForm: string;
  type: "person" | "vehicle" | "address" | "business" | "unknown";
}

interface Case {
  label: string;
  text: string;
  expected: ExpectedEntity[];
  // Set true for cases documenting a KNOWN current limitation — included so
  // the benchmark's overall score reflects reality, not just easy cases.
  knownLimitation?: boolean;
}

const SYNTHETIC_CASES: Case[] = [
  {
    label: "person + address in one sentence",
    text: "IOs observed Jason SMITH (SMITH) exit 12 Preston Point Road, EAST FREMANTLE WA (12 PRESTON POINT RD) and enter a waiting sedan.",
    expected: [
      { rawShortForm: "SMITH", type: "person" },
      { rawShortForm: "12 PRESTON POINT RD", type: "address" },
    ],
  },
  {
    label: "initial+surname person convention",
    text: "TGT met with P.HILL (P.HILL) briefly outside the venue before both departed on foot.",
    expected: [{ rawShortForm: "P.HILL", type: "person" }],
  },
  {
    label: "vehicle + driver + destination address",
    text: "A white Toyota Prado, bearing WA registration 1ABC123 (Vehicle 1ABC123), driven by REID (REID), arrived at 44 Wray Avenue, FREMANTLE WA (44 WRAY AVE) at 1015 hours.",
    expected: [
      { rawShortForm: "Vehicle 1ABC123", type: "vehicle" },
      { rawShortForm: "REID", type: "person" },
      { rawShortForm: "44 WRAY AVE", type: "address" },
    ],
  },
  {
    label: "station wagon vehicle (not a transit station)",
    text: "A blue Ford Falcon station wagon, bearing WA registration 1XYZ789 (Vehicle 1XYZ789), was parked outside 5 Solomon Street, RIVERTON WA (5 SOLOMON ST).",
    expected: [
      { rawShortForm: "Vehicle 1XYZ789", type: "vehicle" },
      { rawShortForm: "5 SOLOMON ST", type: "address" },
    ],
  },
  {
    label: "personalised plate vehicle",
    text: "A black BMW X5, bearing personalised WA registration DRJONES (Vehicle DRJONES), reversed out of the driveway and departed north on Stirling Highway.",
    expected: [{ rawShortForm: "Vehicle DRJONES", type: "vehicle" }],
  },
  {
    label: "cnr/corner address",
    text: "TGT was observed loitering at cnr Stirling Highway and Servetus Street, MOSMAN PARK (CNR STIRLING HWY AND SERVETUS ST) for approximately ten minutes.",
    expected: [
      { rawShortForm: "CNR STIRLING HWY AND SERVETUS ST", type: "address" },
    ],
  },
  {
    label: "lot-number address alongside a vehicle",
    text: "A silver Mazda 3, bearing WA registration 1DEF456 (Vehicle 1DEF456), was parked at Lot 42 Bannister Road, CANNING VALE WA (LOT 42 BANNISTER RD).",
    expected: [
      { rawShortForm: "Vehicle 1DEF456", type: "vehicle" },
      { rawShortForm: "LOT 42 BANNISTER RD", type: "address" },
    ],
  },
  {
    label: "business name prefixed onto a street address",
    text: "Subject entered The Local Hotel, 25 South Terrace, FREMANTLE WA (The Local Hotel) and ordered a drink.",
    expected: [{ rawShortForm: "The Local Hotel", type: "address" }],
  },
  {
    label: "airport terminal address",
    text: "TGT was observed at Perth Airport Terminal 1 (TERMINAL 1) meeting an unknown associate.",
    expected: [{ rawShortForm: "TERMINAL 1", type: "address" }],
  },
  {
    label: "train station address (not a vehicle 'station wagon')",
    text: "The subject was observed entering Fremantle Train Station, ADELAIDE STREET, FREMANTLE WA (Fremantle Train Station).",
    expected: [{ rawShortForm: "Fremantle Train Station", type: "address" }],
  },
  {
    label: "business name with no street address nearby",
    text: "IOs observed TGT enter Crown Perth Casino (Crown Perth Casino) and remain inside for two hours.",
    expected: [{ rawShortForm: "Crown Perth Casino", type: "business" }],
  },
  {
    label: "two people bracketed in one sentence",
    text: "IOs observed Sarah JONES (JONES) meet briefly with Michael CHEN (CHEN) near the entrance before both departed separately.",
    expected: [
      { rawShortForm: "JONES", type: "person" },
      { rawShortForm: "CHEN", type: "person" },
    ],
  },
  {
    label: "google-maps style address with postcode",
    text: "TGT was observed at 131 Lakey Street, Southern River WA 6110, Australia (131 Lakey Street, Southern River WA 6110, Australia).",
    expected: [
      {
        rawShortForm: "131 Lakey Street, Southern River WA 6110, Australia",
        type: "address",
      },
    ],
  },
  {
    label: "surname not misclassified as vehicle from an earlier clause",
    text: "Vehicle 1GDA876, EWEN driver, Jason SMITH (SMITH), departed the address at 1130 hours.",
    expected: [{ rawShortForm: "SMITH", type: "person" }],
  },
  {
    label:
      "KNOWN LIMITATION: digit-leading business name misread as an address",
    text: "Subject stopped briefly at 7-Eleven Rockingham (7-Eleven Rockingham) to purchase fuel.",
    expected: [{ rawShortForm: "7-Eleven Rockingham", type: "business" }],
    knownLimitation: true,
  },
  {
    label:
      "KNOWN LIMITATION: incidental parenthetical picked up as a false-positive vehicle",
    text: "TGT remained stationary in the vehicle for a short time (approximately five minutes) before driving away.",
    expected: [],
    knownLimitation: true,
  },
];

// Source: Operation AMAZE, running sheet 28 (2026-08-26), rows 1-12, as
// supplied by the user via a running-sheet JSON export. Route-list rows
// (9, 10, 11) carry no brackets at all — they double as a false-positive
// stress test, since they're full of capitalised street names.
//
// HOGAN is this sheet's registered target (sheet.targetId links to him) and
// is never bracket-tagged anywhere in this sheet's text — every mention
// below is plain "HOGAN". `expected: []` on those rows is correct for
// extractEntitiesFromText in isolation, which is all this benchmark
// measures. It is NOT a gap in the real Intelligence module: HOGAN is
// still tracked correctly there, via the target-card sheet link and the
// unbracketed-alias rescan getAllIntelligenceEntities() does on top of
// this function (see the SCOPE note at the top of this file).
const REAL_CASES: Case[] = [
  {
    label: "AMAZE row 1 — surveillance commencement address",
    text: "Surveillance commenced in the vicinity of 45 Burrendah Boulevard, WILLETTON WA (45 Burrendah Boulevard).",
    expected: [{ rawShortForm: "45 Burrendah Boulevard", type: "address" }],
  },
  {
    label: "AMAZE row 2 — two vehicles parked, one on a personalised plate",
    text: "A grey Ford Ranger Utility, bearing WA registration 1FAT007 (Vehicle 1FAT007)and a red Holden Monaro coupe, bearing WA registration HOGES (Vehicle HOGES) parked and unattended in the driveway.",
    expected: [
      { rawShortForm: "Vehicle 1FAT007", type: "vehicle" },
      { rawShortForm: "Vehicle HOGES", type: "vehicle" },
    ],
  },
  {
    label:
      "AMAZE row 3 — departure narrative with no brackets (target mention, tracked via registry alias, not the bracket parser)",
    text: "Vehicle 1FAT007 HOGAN driver and sole occupant, departed 45 Burrendah Boulevard and continued via:",
    expected: [],
  },
  {
    label: "AMAZE row 9 — route/street list, no brackets",
    text: "Pinetree Gully Road, WILLETTON,\nBernera Drive,\nKarel Avenue,\nParry Avenue,\nCamm Avenue,\nBull Creek Drive,\nLeach Highway,\nPerth City,\nKwinana Freeway,\nCharles Street,\nGraham Farmer Freeway,\nEast Parade,\nE Parade,\nGuildford Road,\nWalcott Street,\nRoy Street,\nLois La, MOUNT LAWLEY, whereat;",
    expected: [],
  },
  {
    label: "AMAZE row 4 — arrival at a business address, meets an associate",
    text: "Vehicle 1FAT007 HOGAN driver and sole occupant, arrived at Cafe Guilty Pleasure Mount Lawley, 634 Beaufort Street, MOUNT LAWLEY (Cafe Guilty Pleasure Mount Lawley) parked in the car park. HOGAN exited the vehicle and met with Rodney OWEN (OWEN). HOGAN and OWEN walked through the car park, entered Cafe Guilty Pleasure Mount Lawley and continued out of sight.",
    expected: [
      { rawShortForm: "Cafe Guilty Pleasure Mount Lawley", type: "address" },
      { rawShortForm: "OWEN", type: "person" },
    ],
  },
  {
    label:
      "AMAZE row 5 — associate's vehicle departs, target's vehicle departs",
    text: "HOGAN and OWEN exited the cafe, walked through the car park in conversation. OWEN entered a brown BMW X5 SUV, bearing WA registration 1FAB456 (Vehicle 1FAB456). Vehicle 1FAB456, HOGAN driver and sole occupant, departed and continued out of sight. Vehicle 1FAT007 HOGAN driver and sole occupant, departed Cafe Guilty Pleasure Mount Lawley and continued via:",
    expected: [{ rawShortForm: "Vehicle 1FAB456", type: "vehicle" }],
  },
  {
    label: "AMAZE row 10 — route/street list, no brackets",
    text: "Lois La, MOUNT LAWLEY,\nKaata La,\nBarlee Street,\nBeaufort Street,\nVincent Street,\nLoftus Street,\nCambridge Street,\nDenton Street,\nOld Jacaranda Way,\nMere View Way,\nTighe Street,\nAllora Avenue,\nSelvatica Lane, SUBIACO, whereat;",
    expected: [],
  },
  {
    label: "AMAZE row 6 — arrival at a plain street address",
    text: "Vehicle 1FAT007 HOGAN driver and sole occupant, arrived at 21 Allora Avenue, SUBIACO WA (21 Allora Avenue) and parked in the driveway.",
    expected: [{ rawShortForm: "21 Allora Avenue", type: "address" }],
  },
  {
    label: "AMAZE row 7 — departure narrative with no brackets",
    text: "Vehicle 1FAT007, HOGAN driver and sole occupant, departed 21 Allora Avenue and continued via:",
    expected: [],
  },
  {
    label: "AMAZE row 11 — route/street list, no brackets",
    text: "Selvatica Lane, SUBIACO,\nLaurino Terrace,\nTighe Street,\nHay Street,\nTroy Terrace,\nLutey Avenue,\nStubbs Terrace,\nNash Street,\nSelby Street,\nStubbs Terrace,\nAlfred Road,\nW Coast Highway,\nGrant Street,\nMarine Parade, COTTESLOE, whereat;",
    expected: [],
  },
  {
    label: "AMAZE row 8 — arrival at a second business address",
    text: "Vehicle 1FAT007, HOGAN driver and sole occupant, arrived at Cottesloe Beach View Apartments, 152 Marine Parade, COTTESLOE WA (Cottesloe Beach View Apartments) parked in the car park.",
    expected: [
      { rawShortForm: "Cottesloe Beach View Apartments", type: "address" },
    ],
  },
  {
    label: "AMAZE row 12 — surveillance ceased narrative, no brackets",
    text: "Surveillance ceased in the vicinity of Cottesloe Beach View Apartments.",
    expected: [],
  },

  // Source: Operation AMAZE, running sheet 29 (sheet 29, target CORNELL,
  // 2026-08-26), rows 1-13, user-supplied. Note HOGAN appears here as an
  // ASSOCIATE (front passenger) — a different role than on sheet 28, where
  // HOGAN is the target — same name, different entity role on a different
  // sheet. Doesn't affect extraction of the isolated per-row text below,
  // which only cares about the bracket, not sheet-level role.
  {
    label: "AMAZE(CORNELL) row 1 — surveillance commencement address",
    text: "Surveillance commenced in the vicinity of 35 Stirling Highway, NEDLANDS WA (35 Stirling Highway).",
    expected: [{ rawShortForm: "35 Stirling Highway", type: "address" }],
  },
  {
    label:
      "AMAZE(CORNELL) row 2 — two vehicles parked, no location bracket in this row",
    text: "A green Holden Commodore Sedan, bearing WA registration 1DAF836 (Vehicle 1DAF836), and a silver Ford Everest 4WD, bearing WA registration XCF937 (Vehicle XCF937), parked and unattended in the driveway at 35 Stirling Highway.",
    expected: [
      { rawShortForm: "Vehicle 1DAF836", type: "vehicle" },
      { rawShortForm: "Vehicle XCF937", type: "vehicle" },
    ],
  },
  {
    label: "AMAZE(CORNELL) row 3 — departure narrative with no brackets at all",
    text: "CORNELL walked from the vicinity of the residence to Vehicle 1DAF836. Vehicle 1DAF836, CORNELL driver and sole occupant, departed 35 Stirling Highway and continued via: PHOTOGRAPH/S TAKEN",
    expected: [],
  },
  {
    label: "AMAZE(CORNELL) row 4 — arrival at a plain street address",
    text: "Vehicle 1DAF836, CORNELL driver and sole occupant, arrived at 90 Brandon Street, KENSINGTON WA (90 Brandon Street) and street parked. CORNELL exited Vehicle 1DAF836 walked towards the residence and continued out of sight. PHOTOGRAPH/S TAKEN",
    expected: [{ rawShortForm: "90 Brandon Street", type: "address" }],
  },
  {
    label:
      "AMAZE(CORNELL) row 5 — new associate introduced as a front passenger",
    text: "Vehicle 1DAF836, CORNELL driver, Paul HOGAN (HOGAN) front passenger, departed 90 Brandon Street and continued via:",
    expected: [{ rawShortForm: "HOGAN", type: "person" }],
  },
  {
    label:
      "AMAZE(CORNELL) row 6 — associate re-bracketed plus a business+address arrival",
    text: "Vehicle 1DAF836, CORNELL driver, Paul HOGAN (HOGAN) front passenger, arrived and street parked in the vicinity of Cheeky Boy Espresso, 31F Ardross Street, APPLECROSS WA (Cheeky Boy Espresso). CORNELL and HOGAN exited the vehicle and walked into Cheeky Boy Cafe and out of sight.",
    expected: [
      { rawShortForm: "HOGAN", type: "person" },
      { rawShortForm: "Cheeky Boy Espresso", type: "address" },
    ],
  },
  {
    label: "AMAZE(CORNELL) row 7 — plain narrative, no brackets",
    text: "CORNELL and HOGAN seated inside Cheeky Boy Espresso - HOGAN had a black mobile phone on the table in front of him and CORNELL had two mobile phones on the table.",
    expected: [],
  },
  {
    label: "AMAZE(CORNELL) row 8 — plain narrative, no brackets",
    text: "CORNELL and HOGAN paid for their coffee, exited Cheeky Boy Espresso, walked to and entered Vehicle 1DAF836.",
    expected: [],
  },
  {
    label:
      "AMAZE(CORNELL) row 9 — departure narrative, no brackets (subsequent mentions drop them)",
    text: "Vehicle 1DAF836, CORNELL driver, HOGAN front passenger, departed Cheeky Boy Espresso and continued via:",
    expected: [],
  },
  {
    label:
      "AMAZE(CORNELL) row 10 — arrival address bracket with a lowercase unit-letter suffix",
    text: "Vehicle 1DAF836, CORNELL driver, HOGAN front passenger, arrived at 62A Rome Road, MELVILLE WA (62a Rome Road) and parked in the driveway.",
    expected: [{ rawShortForm: "62a Rome Road", type: "address" }],
  },
  {
    label: "AMAZE(CORNELL) row 11 — departure narrative, no brackets",
    text: "Vehicle 1DAF836, CORNELL driver, HOGAN front passenger, departed 62A Rome Road and continued via:",
    expected: [],
  },
  {
    label:
      "AMAZE(CORNELL) row 12 — arrival at an address shared with a different sheet's commencement",
    text: "Vehicle 1DAF836, CORNELL driver, HOGAN front passenger, arrived at 45 Burrendah Boulevard, WILLETTON (45 Burrendah Boulevard)",
    expected: [{ rawShortForm: "45 Burrendah Boulevard", type: "address" }],
  },
  {
    label: "AMAZE(CORNELL) row 13 — surveillance ceased narrative, no brackets",
    text: "Surveillance ceased in the vicinity of 45 Burrendah Boulevard.",
    expected: [],
  },
];

function runBenchmark(cases: Case[], title: string, floor: number) {
  let truePositives = 0;
  let falseNegatives = 0; // expected entity missing, or wrong type
  let falsePositives = 0; // extracted entity not in the expected set
  const misses: string[] = [];

  for (const c of cases) {
    const actual = extractEntitiesFromText(c.text);

    for (const exp of c.expected) {
      const found = actual.find(a => a.rawShortForm === exp.rawShortForm);
      if (found && found.type === exp.type) {
        truePositives++;
      } else {
        falseNegatives++;
        misses.push(
          found
            ? `[${c.label}] "${exp.rawShortForm}": expected type "${exp.type}", got "${found.type}"`
            : `[${c.label}] "${exp.rawShortForm}": not extracted at all`
        );
      }
    }

    const expectedRawForms = new Set(c.expected.map(e => e.rawShortForm));
    for (const a of actual) {
      if (!expectedRawForms.has(a.rawShortForm)) {
        falsePositives++;
        misses.push(
          `[${c.label}] unexpected extra entity: "${a.rawShortForm}" (${a.type})`
        );
      }
    }
  }

  const precision =
    truePositives + falsePositives === 0
      ? 1
      : truePositives / (truePositives + falsePositives);
  const recall =
    truePositives + falseNegatives === 0
      ? 1
      : truePositives / (truePositives + falseNegatives);
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      `── extractEntitiesFromText benchmark: ${title} ──`,
      `Cases: ${cases.length}  (${cases.filter(c => c.knownLimitation).length} flagged as known limitations)`,
      `True positives:  ${truePositives}`,
      `False negatives: ${falseNegatives}`,
      `False positives: ${falsePositives}`,
      `Precision: ${(precision * 100).toFixed(1)}%`,
      `Recall:    ${(recall * 100).toFixed(1)}%`,
      `F1:        ${(f1 * 100).toFixed(1)}%`,
      misses.length ? "\nMisses:" : "",
      ...misses.map(m => "  - " + m),
      "────────────────────────────────────────────────────────",
      "",
    ].join("\n")
  );

  // Floor, not a target — catches a real regression without needing this
  // test file updated every time a dataset is extended.
  expect(f1).toBeGreaterThanOrEqual(floor);
}

describe("extractEntitiesFromText — accuracy benchmarks", () => {
  it("reports precision/recall/F1 across the synthetic dataset", () => {
    runBenchmark(SYNTHETIC_CASES, "synthetic dataset", 0.75);
  });

  it("reports precision/recall/F1 across real running sheets (Operation AMAZE)", () => {
    runBenchmark(
      REAL_CASES,
      "real dataset — Operation AMAZE, sheets 28 + 29",
      0.75
    );
  });
});
