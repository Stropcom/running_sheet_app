import { describe, it, expect } from "vitest";
import { cinsWithImagery, rowHasImagery } from "@shared/rowImagery";

const m = (...cins: string[]) => cins.map(memberName => ({ memberName }));

describe("rowImagery", () => {
  it("counts a row with an imagery phrase", () => {
    expect(
      rowHasImagery({ observation: "PHOTOGRAPHS TAKEN of the address." })
    ).toBe(true);
    expect(rowHasImagery({ observation: "Video footage taken." })).toBe(true);
  });

  it("counts a row with an attached image even without a phrase", () => {
    expect(
      rowHasImagery({ observation: "Exited the vehicle.", attachments: [{}] })
    ).toBe(true);
  });

  it("does not count an ordinary row", () => {
    expect(
      rowHasImagery({ observation: "Exited the vehicle.", attachments: [] })
    ).toBe(false);
  });

  it("collects the CINs on rows with images only", () => {
    const cins = cinsWithImagery([
      { observation: "PHOTOGRAPH TAKEN", members: m("101", "102") },
      { observation: "Walked away.", attachments: [{}], members: m("103") },
      { observation: "Nothing here.", members: m("104") },
    ]);
    expect(Array.from(cins).sort()).toEqual(["101", "102", "103"]);
  });
});
