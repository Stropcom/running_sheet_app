/**
 * Unit tests for the statement exclusion logic used in statement.previewData and statement.generate.
 *
 * The exclusion rules are:
 *   1. "Surveillance Commenced" / "Surveillance Ceased" rows — not real observations
 *   2. "Travelled Via" rows — observation ends in "whereat" AND the immediately
 *      preceding row (by sort order) contains "continued via:" in its observation
 *
 * A CIN is excluded from statement generation only if ALL of its row appearances
 * are in excluded rows. If a CIN has at least one qualifying (non-excluded) row,
 * it should produce a statement.
 *
 * A CIN on the roster with ZERO row appearances is treated as qualifying
 * (being on the roster counts as a surveillance day).
 */

import { describe, it, expect } from "vitest";

// ─── Replicated exclusion logic (mirrors routers.ts) ─────────────────────────

type Row = {
  id: number;
  observation: string | null;
};

type Member = {
  rowId: number;
  memberName: string; // stores CIN
};

type RosterEntry = {
  cin: string;
  hasImages?: boolean;
  isAuthor?: boolean;
};

function computeExclusions(
  sortedRows: Row[],
  members: Member[],
  roster: RosterEntry[]
): Map<string, { hasQualifyingRow: boolean; exclusionReasons: Set<string> }> {
  // Determine which rows are excluded
  const excludedRowIds = new Set<number>();
  const excludedRowReasons = new Map<number, string>();

  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    const obs = (row.observation ?? "").trim();

    // Rule 1: Surveillance Commenced / Surveillance Ceased
    const isSurveillanceMarker =
      /^surveillance commenced$/i.test(obs) ||
      /^surveillance ceased$/i.test(obs);
    if (isSurveillanceMarker) {
      excludedRowIds.add(row.id);
      excludedRowReasons.set(row.id, "surveillance-marker");
      continue;
    }

    // Rule 2: Travelled Via — ends in "whereat" and previous row contains "continued via:"
    const endsInWhereat = /whereat$/i.test(obs);
    if (endsInWhereat && i > 0) {
      const prevObs = (sortedRows[i - 1].observation ?? "").toLowerCase();
      if (prevObs.includes("continued via:")) {
        excludedRowIds.add(row.id);
        excludedRowReasons.set(row.id, "travelled-via");
      }
    }
  }

  // Build per-CIN result
  const cinMap = new Map<string, { hasQualifyingRow: boolean; exclusionReasons: Set<string> }>();

  for (const entry of roster) {
    const cinUpper = entry.cin.toUpperCase();
    if (!cinMap.has(cinUpper)) {
      cinMap.set(cinUpper, { hasQualifyingRow: false, exclusionReasons: new Set() });
    }
    const data = cinMap.get(cinUpper)!;

    const cinRowIds = members
      .filter((m) => m.memberName.toUpperCase() === cinUpper)
      .map((m) => m.rowId);

    for (const rowId of cinRowIds) {
      if (!excludedRowIds.has(rowId)) {
        data.hasQualifyingRow = true;
      } else {
        const reason = excludedRowReasons.get(rowId);
        if (reason) data.exclusionReasons.add(reason);
      }
    }

    // CIN on roster with no row appearances → qualifying (being on roster counts)
    if (cinRowIds.length === 0) {
      data.hasQualifyingRow = true;
    }
  }

  return cinMap;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Statement exclusion logic", () => {
  // ── Rule 1: Surveillance Commenced / Surveillance Ceased ──────────────────

  it("excludes CIN that only appears in a 'Surveillance Commenced' row", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Commenced" },
    ];
    const members: Member[] = [{ rowId: 1, memberName: "1234" }];
    const roster: RosterEntry[] = [{ cin: "1234" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("1234")!;
    expect(cin.hasQualifyingRow).toBe(false);
    expect(cin.exclusionReasons.has("surveillance-marker")).toBe(true);
  });

  it("excludes CIN that only appears in a 'Surveillance Ceased' row", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Ceased" },
    ];
    const members: Member[] = [{ rowId: 1, memberName: "1234" }];
    const roster: RosterEntry[] = [{ cin: "1234" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("1234")!;
    expect(cin.hasQualifyingRow).toBe(false);
    expect(cin.exclusionReasons.has("surveillance-marker")).toBe(true);
  });

  it("excludes CIN that appears in BOTH Surveillance Commenced and Surveillance Ceased rows (case-insensitive)", () => {
    const rows: Row[] = [
      { id: 1, observation: "SURVEILLANCE COMMENCED" },
      { id: 2, observation: "surveillance ceased" },
    ];
    const members: Member[] = [
      { rowId: 1, memberName: "1234" },
      { rowId: 2, memberName: "1234" },
    ];
    const roster: RosterEntry[] = [{ cin: "1234" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("1234")!;
    expect(cin.hasQualifyingRow).toBe(false);
  });

  it("does NOT exclude CIN that appears in a Surveillance Commenced row AND a normal row", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Commenced" },
      { id: 2, observation: "Parked outside 27 Smith Street whereat" },
    ];
    const members: Member[] = [
      { rowId: 1, memberName: "1234" },
      { rowId: 2, memberName: "1234" },
    ];
    const roster: RosterEntry[] = [{ cin: "1234" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("1234")!;
    expect(cin.hasQualifyingRow).toBe(true);
  });

  it("does NOT exclude a CIN whose observation text contains but is not exactly 'Surveillance Commenced'", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Commenced at 0800" }, // not exact match
    ];
    const members: Member[] = [{ rowId: 1, memberName: "1234" }];
    const roster: RosterEntry[] = [{ cin: "1234" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("1234")!;
    // This row is NOT excluded (doesn't match exactly), so CIN has a qualifying row
    expect(cin.hasQualifyingRow).toBe(true);
  });

  // ── Rule 2: Travelled Via ─────────────────────────────────────────────────

  it("excludes CIN that only appears in a 'Travelled Via' row (ends in whereat, prev has continued via:)", () => {
    const rows: Row[] = [
      { id: 1, observation: "Continued via: Main Street" },
      { id: 2, observation: "Arrived at destination whereat" },
    ];
    const members: Member[] = [{ rowId: 2, memberName: "5678" }];
    const roster: RosterEntry[] = [{ cin: "5678" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("5678")!;
    expect(cin.hasQualifyingRow).toBe(false);
    expect(cin.exclusionReasons.has("travelled-via")).toBe(true);
  });

  it("does NOT exclude CIN in a 'whereat' row when previous row does NOT contain 'continued via:'", () => {
    const rows: Row[] = [
      { id: 1, observation: "Drove to 5 Oak Avenue" },
      { id: 2, observation: "Parked outside 5 Oak Avenue whereat" },
    ];
    const members: Member[] = [{ rowId: 2, memberName: "5678" }];
    const roster: RosterEntry[] = [{ cin: "5678" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("5678")!;
    // Row 2 ends in "whereat" but prev row has no "continued via:" → not excluded
    expect(cin.hasQualifyingRow).toBe(true);
  });

  it("does NOT exclude CIN in a row that ends in 'whereat' if it is the first row (no previous row)", () => {
    const rows: Row[] = [
      { id: 1, observation: "Parked at 10 High Street whereat" },
    ];
    const members: Member[] = [{ rowId: 1, memberName: "5678" }];
    const roster: RosterEntry[] = [{ cin: "5678" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("5678")!;
    expect(cin.hasQualifyingRow).toBe(true);
  });

  it("handles 'Continued via:' case-insensitively", () => {
    const rows: Row[] = [
      { id: 1, observation: "CONTINUED VIA: Highway 1" },
      { id: 2, observation: "Arrived at destination whereat" },
    ];
    const members: Member[] = [{ rowId: 2, memberName: "5678" }];
    const roster: RosterEntry[] = [{ cin: "5678" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("5678")!;
    expect(cin.hasQualifyingRow).toBe(false);
    expect(cin.exclusionReasons.has("travelled-via")).toBe(true);
  });

  // ── Roster with no row appearances ───────────────────────────────────────

  it("treats CIN on roster with NO row appearances as qualifying", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Commenced" },
    ];
    const members: Member[] = []; // CIN not in any row
    const roster: RosterEntry[] = [{ cin: "9999" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("9999")!;
    expect(cin.hasQualifyingRow).toBe(true);
  });

  // ── Multiple CINs ─────────────────────────────────────────────────────────

  it("correctly separates qualifying and excluded CINs in the same sheet", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Commenced" },
      { id: 2, observation: "Target observed leaving premises" },
      { id: 3, observation: "Surveillance Ceased" },
    ];
    const members: Member[] = [
      { rowId: 1, memberName: "1111" }, // only in surveillance marker
      { rowId: 2, memberName: "2222" }, // in a normal row
      { rowId: 3, memberName: "1111" }, // also in surveillance ceased
      { rowId: 2, memberName: "1111" }, // also in normal row → should qualify
    ];
    const roster: RosterEntry[] = [{ cin: "1111" }, { cin: "2222" }];

    const result = computeExclusions(rows, members, roster);
    // 1111 appears in rows 1, 2, 3 — row 2 is qualifying
    expect(result.get("1111")!.hasQualifyingRow).toBe(true);
    // 2222 appears in row 2 only — qualifying
    expect(result.get("2222")!.hasQualifyingRow).toBe(true);
  });

  it("excludes CIN 1111 when it only appears in surveillance marker rows, qualifies 2222", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Commenced" },
      { id: 2, observation: "Target observed leaving premises" },
      { id: 3, observation: "Surveillance Ceased" },
    ];
    const members: Member[] = [
      { rowId: 1, memberName: "1111" },
      { rowId: 3, memberName: "1111" },
      { rowId: 2, memberName: "2222" },
    ];
    const roster: RosterEntry[] = [{ cin: "1111" }, { cin: "2222" }];

    const result = computeExclusions(rows, members, roster);
    expect(result.get("1111")!.hasQualifyingRow).toBe(false);
    expect(result.get("1111")!.exclusionReasons.has("surveillance-marker")).toBe(true);
    expect(result.get("2222")!.hasQualifyingRow).toBe(true);
  });

  // ── Combined exclusion reasons ────────────────────────────────────────────

  it("reports both exclusion reasons when CIN appears in both surveillance-marker and travelled-via rows", () => {
    const rows: Row[] = [
      { id: 1, observation: "Surveillance Commenced" },
      { id: 2, observation: "Continued via: Main Street" },
      { id: 3, observation: "Arrived at destination whereat" },
    ];
    const members: Member[] = [
      { rowId: 1, memberName: "3333" },
      { rowId: 3, memberName: "3333" },
    ];
    const roster: RosterEntry[] = [{ cin: "3333" }];

    const result = computeExclusions(rows, members, roster);
    const cin = result.get("3333")!;
    expect(cin.hasQualifyingRow).toBe(false);
    expect(cin.exclusionReasons.has("surveillance-marker")).toBe(true);
    expect(cin.exclusionReasons.has("travelled-via")).toBe(true);
  });
});
