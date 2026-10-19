import { beforeEach, describe, expect, it } from "vitest";
import {
  getAiStats,
  recordAiImport,
  resetAiStats,
} from "./documentImport/aiStats";

const rec = (over: Partial<Parameters<typeof recordAiImport>[0]> = {}) =>
  recordAiImport({
    mode: "ran",
    calls: 0,
    confirmed: 0,
    suggested: 0,
    stoppedEarly: false,
    aiMs: 0,
    totalMs: 100,
    ...over,
  });

describe("document AI tally", () => {
  beforeEach(() => resetAiStats());

  it("starts empty", () => {
    const s = getAiStats();
    expect(s.imports).toBe(0);
    expect(s.calls).toBe(0);
  });

  it("counts imports with and without the AI step, and what the AI did", () => {
    rec({ calls: 3, confirmed: 1, suggested: 1, aiMs: 9000, totalMs: 9500 });
    rec({ calls: 0, totalMs: 300 }); // AI on, nothing for it to check
    rec({ mode: "off", totalMs: 400 });
    rec({ mode: "unavailable", totalMs: 200 });
    rec({ calls: 8, stoppedEarly: true, aiMs: 15000, totalMs: 15500 });
    const s = getAiStats();
    expect(s.imports).toBe(5);
    expect(s.withAi).toBe(3);
    expect(s.withoutAi).toBe(2);
    expect(s.checked).toBe(2);
    expect(s.calls).toBe(11);
    expect(s.confirmed).toBe(1);
    expect(s.suggested).toBe(1);
    expect(s.stoppedEarly).toBe(1);
    expect(s.totalMsWithAi).toBe(9500 + 300 + 15500);
    expect(s.totalMsWithoutAi).toBe(600);
  });

  it("starts again from zero on request", () => {
    rec({ calls: 2, suggested: 2 });
    resetAiStats();
    expect(getAiStats().imports).toBe(0);
    expect(getAiStats().suggested).toBe(0);
  });
});
