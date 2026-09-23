import { describe, it, expect } from "vitest";
import { diffDocumentSnapshots } from "@/lib/documentImportDiff";
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
