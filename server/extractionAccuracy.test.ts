/**
 * Synthetic accuracy benchmark for extractEntitiesFromText.
 *
 * This is deliberately NOT a pass/fail regression suite like
 * entityClassification.test.ts or addressFormat.test.ts (which each assert
 * one specific known behaviour). Instead it runs a representative batch of
 * synthetic observation sentences — written to mirror the phrasing and
 * bracket-tagging convention officers actually use on the running sheet —
 * against the real extraction function, and reports precision/recall/F1
 * across the whole batch. That gives a genuine, reproducible accuracy
 * number instead of a guess, and a place to compare against once real
 * (de-identified) observation text is available.
 *
 * The dataset intentionally includes a few "hard" cases the extractor is
 * known/expected to get wrong (a business name that starts with a digit,
 * a parenthetical aside that happens to contain the word "vehicle") — the
 * point of a benchmark is an honest number, not a cherry-picked one.
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

const CASES: Case[] = [
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

describe("extractEntitiesFromText — synthetic accuracy benchmark", () => {
  it("reports precision/recall/F1 across the synthetic dataset", () => {
    let truePositives = 0;
    let falseNegatives = 0; // expected entity missing, or wrong type
    let falsePositives = 0; // extracted entity not in the expected set
    const misses: string[] = [];

    for (const c of CASES) {
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
        "── extractEntitiesFromText synthetic accuracy benchmark ──",
        `Cases: ${CASES.length}  (${CASES.filter(c => c.knownLimitation).length} flagged as known limitations)`,
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
    // test file updated every time the synthetic dataset is extended.
    expect(f1).toBeGreaterThanOrEqual(0.75);
  });
});
