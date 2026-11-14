import { describe, expect, it } from "vitest";
import { governanceOutstandingItems } from "./db/governance";

const rec = (over: Record<string, unknown> = {}) =>
  ({
    isurv: false,
    sentToIO: false,
    savedInOpFolder: false,
    savedInInvestigatorTransferDrive: false,
    imageryEntries: null,
    ...over,
  }) as any;

describe("governanceOutstandingItems", () => {
  it("Team Leader: summary, sent to IO, and ready to close while open", () => {
    const r = governanceOutstandingItems({
      entry: { isTeamLeader: true },
      rec: rec(),
      allSigned: false,
      closed: false,
    });
    expect(r.teamLeader).toEqual([
      "Summary complete",
      "Sent to IO",
      "Ready to close",
    ]);
    expect(r.author).toBeNull();
  });
  it("Team Leader: nothing left once done and closed", () => {
    const r = governanceOutstandingItems({
      entry: { isTeamLeader: true },
      rec: rec({ isurv: true, sentToIO: true }),
      allSigned: true,
      closed: true,
    });
    expect(r.teamLeader).toEqual([]);
  });
  it("no record at all counts as nothing done", () => {
    const r = governanceOutstandingItems({
      entry: { isTeamLeader: true },
      rec: undefined,
      allSigned: false,
      closed: true,
    });
    expect(r.teamLeader).toEqual(["Summary complete", "Sent to IO"]);
  });
  it("Author: waits for certification, then the operative items and one imagery line", () => {
    const waiting = governanceOutstandingItems({
      entry: { isAuthor: true },
      rec: rec(),
      allSigned: false,
      closed: false,
    });
    expect(waiting.author).toEqual(["Sheet not fully certified"]);
    const signed = governanceOutstandingItems({
      entry: { isAuthor: true },
      rec: rec({
        savedInOpFolder: true,
        imageryEntries: JSON.stringify([{ saved: false }, { saved: true }, {}]),
      }),
      allSigned: true,
      closed: false,
    });
    expect(signed.author).toEqual([
      "Saved in Investigator transfer drive",
      "2 imagery entries not saved",
    ]);
    const one = governanceOutstandingItems({
      entry: { isAuthor: true },
      rec: rec({
        savedInOpFolder: true,
        savedInInvestigatorTransferDrive: true,
        imageryEntries: JSON.stringify([{ saved: false }]),
      }),
      allSigned: true,
      closed: true,
    });
    expect(one.author).toEqual(["1 imagery entry not saved"]);
  });
  it("both roles on one sheet give both lists; neither gives none", () => {
    const both = governanceOutstandingItems({
      entry: { isTeamLeader: true, isAuthor: true },
      rec: rec({ isurv: true, sentToIO: true }),
      allSigned: false,
      closed: true,
    });
    expect(both.teamLeader).toEqual([]);
    expect(both.author).toEqual(["Sheet not fully certified"]);
    const none = governanceOutstandingItems({
      entry: {},
      rec: rec(),
      allSigned: true,
      closed: false,
    });
    expect(none).toEqual({ teamLeader: null, author: null });
  });
});
