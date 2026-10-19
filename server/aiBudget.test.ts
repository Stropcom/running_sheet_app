import { describe, expect, it } from "vitest";
import { aiCallsInFlight, withinBudget } from "./documentImport/aiBudget";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("withinBudget", () => {
  it("returns the value of a call that finishes in time", async () => {
    const r = await withinBudget(Date.now() + 500, async () => "ok");
    expect(r).toEqual({ ok: true, value: "ok" });
    expect(aiCallsInFlight()).toBe(0);
  });

  it("stops waiting when the budget runs out, and is busy until the call really ends", async () => {
    const slow = withinBudget(Date.now() + 30, async () => {
      await sleep(120);
      return "late";
    });
    expect(await slow).toEqual({ ok: false, reason: "budget" });
    // The model call can't be cancelled: a new one waits its turn by being skipped.
    expect(aiCallsInFlight()).toBe(1);
    const next = await withinBudget(Date.now() + 500, async () => "x");
    expect(next).toEqual({ ok: false, reason: "busy" });
    await sleep(150);
    expect(aiCallsInFlight()).toBe(0);
    expect(await withinBudget(Date.now() + 500, async () => "y")).toEqual({
      ok: true,
      value: "y",
    });
  });

  it("does not start a call when no time is left", async () => {
    let started = false;
    const r = await withinBudget(Date.now() - 1, async () => {
      started = true;
      return "x";
    });
    expect(r).toEqual({ ok: false, reason: "budget" });
    expect(started).toBe(false);
  });

  it("turns a model error into a skipped check, never a thrown error", async () => {
    const r = await withinBudget(Date.now() + 500, async () => {
      throw new Error("model blew up");
    });
    expect(r).toEqual({ ok: false, reason: "error" });
    await sleep(5);
    expect(aiCallsInFlight()).toBe(0);
  });
});
