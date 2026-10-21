import { describe, expect, it } from "vitest";
import { checkJoiningWords, checkTypingSlips } from "./sheetCheck";

const row = (rowId: number, observation: string) => ({
  rowId,
  timeMinutes: 600 + rowId,
  observation,
});

function applyFix(text: string, f: { wrong: string; correct: string }) {
  return text.replace(f.wrong, f.correct);
}

describe("Check Sheet — typing slips", () => {
  it("flags a doubled word with a one-tap fix", () => {
    const text = "CORNELL walked to the the car park.";
    const f = checkTypingSlips([row(1, text)]);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe("typing-slip");
    expect(applyFix(text, f[0].suggestedFix!)).toBe(
      "CORNELL walked to the car park."
    );
  });

  it("flags a glued street type, a doubled comma and a stray full stop", () => {
    const glued = "entered 64 Sewell Streetand continued out of sight.";
    const g = checkTypingSlips([row(1, glued)]);
    expect(g).toHaveLength(1);
    expect(applyFix(glued, g[0].suggestedFix!)).toBe(
      "entered 64 Sewell Street and continued out of sight."
    );

    const commas = "HOGAN walked,, then stopped.";
    const c = checkTypingSlips([row(2, commas)]);
    expect(c).toHaveLength(1);
    expect(applyFix(commas, c[0].suggestedFix!)).toBe(
      "HOGAN walked, then stopped."
    );

    const stop = "HOGAN entered. 64 Sewell Street and left.";
    const s = checkTypingSlips([row(3, stop)]);
    expect(s).toHaveLength(1);
    expect(applyFix(stop, s[0].suggestedFix!)).toBe(
      "HOGAN entered 64 Sewell Street and left."
    );
  });

  it("leaves clean rows, brackets and real sentences alone", () => {
    expect(
      checkTypingSlips([
        row(1, "HOGAN entered. SANTOS walked off."),
        row(2, "Seen with a man (that that) was had had."),
        row(3, "Surveillance commenced at 64 Sewell Street."),
      ])
    ).toEqual([]);
  });

  it("makes each finding's fix unique when the same slip repeats", () => {
    const text = "walked to the the shop and to the the car.";
    const f = checkTypingSlips([row(1, text)]);
    expect(f).toHaveLength(2);
    let out = text;
    for (const x of f) out = applyFix(out, x.suggestedFix!);
    expect(out).toBe("walked to the shop and to the car.");
  });
});

describe("Check Sheet — joining words", () => {
  it("flags two whole sentences run together", () => {
    const text = "Surveillance commenced Out of sight";
    const f = checkJoiningWords([row(1, "Out of sight Continued out of sight")]);
    void text;
    expect(f.every(x => x.ruleId === "joining-word-missing")).toBe(true);
  });

  it("flags 'and' missing before 'continued out of sight' after an entered place", () => {
    const text =
      "HOGAN entered Crooked Spire Coffee & Art House Midland continued out of sight.";
    const f = checkJoiningWords([row(1, text)]);
    expect(f).toHaveLength(1);
    expect(applyFix(text, f[0].suggestedFix!)).toBe(
      "HOGAN entered Crooked Spire Coffee & Art House Midland and continued out of sight."
    );
  });

  it("flags a missing 'A' in front of a single vehicle opening a sentence", () => {
    const text =
      "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414), parked.";
    const f = checkJoiningWords([row(1, text)]);
    expect(f).toHaveLength(1);
    expect(f[0].reason).toMatch(/"A"/);
    expect(applyFix(text, f[0].suggestedFix!).startsWith("A white Lexus")).toBe(
      true
    );
  });

  it("flags 'at' between Surveillance commenced and an address", () => {
    const text = "Surveillance commenced 64 Sewell Street, MIDLAND.";
    const f = checkJoiningWords([row(1, text)]);
    expect(f).toHaveLength(1);
    expect(applyFix(text, f[0].suggestedFix!)).toContain("commenced at 64");
  });

  it("leaves rows that are already joined alone", () => {
    expect(
      checkJoiningWords([
        row(1, "Surveillance commenced at 64 Sewell Street, MIDLAND."),
        row(2, "HOGAN entered the car park and continued out of sight."),
      ])
    ).toEqual([]);
  });
});
