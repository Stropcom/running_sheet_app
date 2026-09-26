import { describe, it, expect } from "vitest";
import { diffDocumentSnapshots, countChanges } from "@/lib/documentImportDiff";
import {
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
} from "@/components/TargetStructuredFields";
import type { DocumentImportPrefill } from "@/components/ImportTargetDocumentDialog";
import type { StagedAssociate } from "@/components/AddTargetDialog";

// Regression: the "Removed since V1" associates diff used to compare only
// each version's own STAGED "create as new" associates, not everyone the
// parser recognised — so an associate who already existed and got routed
// to associate.update (instead of being staged) on a later import dropped
// out of that narrow list and showed as "removed" even though they're
// still named in the document's own Background text. See documentImportDiff.ts.

function associate(firstNames: string, surname: string): StagedAssociate {
  return {
    key: `${firstNames}-${surname}`,
    identity: { firstNames, surname, bornDate: "" },
    address: EMPTY_ADDRESS_PARTS,
    vehicle: EMPTY_VEHICLE_PARTS,
  };
}

function prefill(
  overrides: Partial<DocumentImportPrefill>
): DocumentImportPrefill {
  return {
    identity: { firstNames: "", surname: "", bornDate: "" },
    address: EMPTY_ADDRESS_PARTS,
    vehicle: EMPTY_VEHICLE_PARTS,
    extraAddresses: [],
    extraVehicles: [],
    associates: [],
    images: [],
    background: "",
    sourceFileName: "",
    ...overrides,
  };
}

describe("diffDocumentSnapshots associates", () => {
  it("doesn't flag an associate as removed once they're no longer staged, as long as they're still named in the Background", () => {
    const previous = prefill({
      associates: [associate("Noah James", "Peters")],
      background: "Noah James PETERS was seen nearby.",
    });
    // v2: PETERS is now recognised as an already-existing associate, so
    // they're no longer in the staged "create as new" list — but they're
    // still named in this version's own Background.
    const current = prefill({
      associates: [],
      background: "Noah James PETERS was seen nearby again.",
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(diff.associates).toHaveLength(1);
    expect(diff.associates[0].status).toBe("unchanged");
  });

  it("still flags an associate as removed when they're genuinely gone from the Background too", () => {
    const previous = prefill({
      associates: [associate("Jordan", "Jacks")],
      background: "Jordan JACKS was seen nearby.",
    });
    const current = prefill({
      associates: [],
      background: "Nothing else of note.",
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(diff.associates).toHaveLength(1);
    expect(diff.associates[0].status).toBe("removed");
  });

  it("still flags a genuinely new associate as added", () => {
    const previous = prefill({ associates: [] });
    const current = prefill({
      associates: [associate("Mia", "Hart")],
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(diff.associates).toHaveLength(1);
    expect(diff.associates[0].status).toBe("added");
  });

  it("marks an associate as changed (not removed+added) when the same person's details are edited between versions", () => {
    const previous = prefill({
      associates: [
        { ...associate("Sarah Louise", "Mackay"), key: "sarah-mackay" },
      ],
    });
    // Same person (same surname), but a DOB has now been captured — should
    // read as one "changed" line, not an unrelated remove+add pair.
    const current = prefill({
      associates: [
        {
          key: "sarah-mackay",
          identity: {
            firstNames: "Sarah Louise",
            surname: "Mackay",
            bornDate: "01/01/1990",
          },
          address: EMPTY_ADDRESS_PARTS,
          vehicle: EMPTY_VEHICLE_PARTS,
        },
      ],
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(diff.associates).toHaveLength(1);
    expect(diff.associates[0].status).toBe("changed");
    expect(diff.associates[0].wasText).toBe("Sarah Louise MACKAY (MACKAY)");
  });

  it("doesn't false-positive on a surname that's only a substring of another word in the Background", () => {
    const previous = prefill({
      associates: [associate("Sam", "Hart")],
      background: "Sam HART was seen nearby.",
    });
    // "HART" is not a whole word anywhere in this Background (it's inside
    // "SWEETHART") — should still be flagged removed.
    const current = prefill({
      associates: [],
      background: "Someone's SWEETHART was mentioned.",
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(diff.associates[0].status).toBe("removed");
  });
});

describe("diffDocumentSnapshots backgroundSections", () => {
  it("groups the current Background into its own real sections, not one flat paragraph list", () => {
    const previous = prefill({ background: "" });
    const current = prefill({
      background: [
        "SUMMARY",
        "Departed the address.",
        "COMMUNICATIONS",
        "Mobile: 0491 570 168",
      ].join("\n\n"),
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(diff.backgroundSections).toEqual([
      {
        heading: "SUMMARY",
        paragraphs: [{ text: "Departed the address.", status: "added" }],
      },
      {
        heading: "COMMUNICATIONS",
        paragraphs: [{ text: "Mobile: 0491 570 168", status: "added" }],
      },
    ]);
  });

  it("matches a paragraph as unchanged against the previous version's own paragraphs regardless of which section it sat under there", () => {
    // A paragraph that moved to a different heading between versions (or
    // had no heading before but does now) should still read as unchanged
    // — the previous version's own paragraphs are pooled flat, not
    // matched section-by-section.
    const previous = prefill({
      background: "Nadia Farah QURESHI was seen at the address.",
    });
    const current = prefill({
      background: [
        "SUMMARY",
        "Nadia Farah QURESHI was seen at the address.",
      ].join("\n\n"),
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(diff.backgroundSections).toEqual([
      {
        heading: "SUMMARY",
        paragraphs: [
          {
            text: "Nadia Farah QURESHI was seen at the address.",
            status: "unchanged",
          },
        ],
      },
    ]);
  });

  it("counts a newly-added background paragraph towards countChanges", () => {
    const previous = prefill({ background: "SUMMARY\n\nOriginal note." });
    const current = prefill({
      background: "SUMMARY\n\nOriginal note.\n\nA brand new note.",
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    expect(countChanges(diff)).toBe(1);
  });

  // Regression (Operation TIDELINE): re-importing the exact same document
  // as a .docx after it was first imported as a .pdf (or vice versa) used
  // to show almost every Background line as "added" — not because the
  // content had changed, but because a PDF's own text layout glues several
  // sentences into one paragraph while a .docx keeps each sentence as its
  // own paragraph, and the diff matched on exact paragraph text. See
  // textFormat.test.ts's own sentence-splitting regression for the fix.
  it("reads every sentence as unchanged when the same facts arrive glued into one PDF-style paragraph vs. one sentence per DOCX-style paragraph", () => {
    const previous = prefill({
      background: [
        "SUMMARY",
        "Associates: Dominic Paul RUSSO 27 Garden Street, EAST PERTH WA 6004. 1DPR27 (WA) 2022 red Alfa Romeo Stelvio wagon. On 21 August 2026, Priya Elise NAIR attended the office.",
      ].join("\n\n"),
    });
    const current = prefill({
      background: [
        "Associates: Dominic Paul RUSSO 27 Garden Street, EAST PERTH WA 6004.",
        "1DPR27 (WA) 2022 red Alfa Romeo Stelvio wagon.",
        "On 21 August 2026, Priya Elise NAIR attended the office.",
      ].join("\n\n"),
    });

    const diff = diffDocumentSnapshots(current, previous)!;
    const statuses = diff.backgroundSections.flatMap(s =>
      s.paragraphs.map(p => p.status)
    );
    expect(statuses).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(countChanges(diff)).toBe(0);
  });
});
