import { describe, it, expect, vi } from "vitest";
import { scanForMissedPersonMentions } from "./missedEntityScan";
import { findPersonMentions } from "./localNER";
import type { ObservationTextForScan } from "./db";

vi.mock("./localNER", () => ({
  findPersonMentions: vi.fn(),
}));

function makeObservation(
  overrides: Partial<ObservationTextForScan>
): ObservationTextForScan {
  return {
    rowId: 1,
    sheetId: 1,
    sheetTitle: "Sheet 1",
    operationName: "Op One",
    observation: "some observation text",
    ...overrides,
  };
}

describe("scanForMissedPersonMentions", () => {
  it("flags a name NER found that matches nothing already known", async () => {
    vi.mocked(findPersonMentions).mockResolvedValueOnce([
      { text: "Sarah Connor", score: 0.95 },
    ]);

    const findings = await scanForMissedPersonMentions(
      [makeObservation({ observation: "Sarah Connor walked into the shop" })],
      [{ id: "John Smith", label: "John Smith" }]
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("possible-missed-person-mention");
    expect(findings[0].shortForm).toBe("Sarah Connor");
  });

  it("does not flag a name already known, even loosely (typo overlap belongs to the other rule)", async () => {
    vi.mocked(findPersonMentions).mockResolvedValueOnce([
      { text: "Jhon Smith", score: 0.9 },
    ]);

    const findings = await scanForMissedPersonMentions(
      [makeObservation({})],
      [{ id: "John Smith", label: "John Smith" }]
    );

    expect(findings).toHaveLength(0);
  });

  it("does not flag a name that exactly matches a known name (the real RAYSON bug: exact match was never checked)", async () => {
    vi.mocked(findPersonMentions).mockResolvedValueOnce([
      { text: "Stevie RAYSON", score: 0.94 },
    ]);

    const findings = await scanForMissedPersonMentions(
      [makeObservation({})],
      [{ id: "Stevie RAYSON", label: "Stevie RAYSON" }]
    );

    expect(findings).toHaveLength(0);
  });

  it("merges repeat mentions of the same missed name into one finding", async () => {
    vi.mocked(findPersonMentions)
      .mockResolvedValueOnce([{ text: "Sarah Connor", score: 0.95 }])
      .mockResolvedValueOnce([{ text: "Sarah Connor", score: 0.92 }]);

    const findings = await scanForMissedPersonMentions(
      [
        makeObservation({ rowId: 1, observation: "first mention" }),
        makeObservation({ rowId: 2, observation: "second mention" }),
      ],
      []
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].occurrences).toHaveLength(2);
  });

  it("skips a row cleanly if the model throws, rather than failing the whole scan", async () => {
    vi.mocked(findPersonMentions)
      .mockRejectedValueOnce(new Error("model not loaded"))
      .mockResolvedValueOnce([{ text: "Sarah Connor", score: 0.95 }]);

    const findings = await scanForMissedPersonMentions(
      [
        makeObservation({ rowId: 1, observation: "row that errors" }),
        makeObservation({ rowId: 2, observation: "row that works" }),
      ],
      []
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].occurrences).toHaveLength(1);
  });

  it("returns nothing when NER finds no person mentions", async () => {
    vi.mocked(findPersonMentions).mockResolvedValueOnce([]);

    const findings = await scanForMissedPersonMentions(
      [makeObservation({})],
      []
    );

    expect(findings).toHaveLength(0);
  });
});
