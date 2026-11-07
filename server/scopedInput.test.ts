import { describe, expect, it } from "vitest";
import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { scopedInputOpts } from "./_core/trpc";

// The operation guard trims a list of operation ids to the ones the person may
// reach and hands the trimmed input on. The procedure's own .input(...) step
// then re-reads the ORIGINAL request; this checks the trimmed list is the one
// the procedure ends up with.
const t = initTRPC.context<{}>().create();
const REACHABLE = [1];

const trimToReachable = (pass: "plain" | "scoped") =>
  t.middleware(async ({ next, getRawInput }) => {
    const raw = (await getRawInput()) as { operationIds?: number[] };
    const trimmed = {
      ...raw,
      operationIds: (raw.operationIds ?? []).filter(i => REACHABLE.includes(i)),
    };
    return pass === "scoped"
      ? next({ ...scopedInputOpts(trimmed) })
      : next({ input: trimmed });
  });

const listProcedure = (pass: "plain" | "scoped") =>
  t.procedure
    .use(trimToReachable(pass))
    .input(z.object({ operationIds: z.array(z.number()).optional() }))
    .query(({ input }) => input.operationIds ?? null);

describe("a trimmed list stays trimmed after the procedure's own input step", () => {
  it("(the problem) passing only `input` puts the original list back", async () => {
    const caller = t.router({ list: listProcedure("plain") }).createCaller({});
    expect(await caller.list({ operationIds: [1, 2] })).toEqual([1, 2]);
  });

  it("passing the trimmed input as what later steps read keeps it trimmed", async () => {
    const caller = t.router({ list: listProcedure("scoped") }).createCaller({});
    expect(await caller.list({ operationIds: [1, 2] })).toEqual([1]);
    expect(await caller.list({ operationIds: [2, 3] })).toEqual([]);
    expect(await caller.list({ operationIds: [1] })).toEqual([1]);
  });
});
