import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUT_ORDER,
  fixedChipRank,
  initialShortcutOrder,
  orderRsChips,
} from "../shared/rsChips";

const labels = (xs: { label: string }[]) => xs.map(x => x.label);
const chips = (...ls: string[]) => ls.map(label => ({ label }));

describe("orderRsChips", () => {
  const order = ["SC", "DSO", "DR", "FP", "OOS", "PT", "RACK"];

  it("puts the fixed target block straight after SC", () => {
    const out = orderRsChips(
      chips("PT", "TGT", "HB", "V1", "SC", "HBF", "V1F", "DSO"),
      order
    );
    expect(labels(out)).toEqual([
      "SC",
      "HBF",
      "V1F",
      "V1",
      "TGT",
      "HB",
      "DSO",
      "PT",
    ]);
  });

  it("follows the Shortcuts-page order for shortcut chips", () => {
    const out = orderRsChips(chips("RACK", "DSO", "SC", "PT"), [
      "PT",
      "SC",
      "RACK",
      "DSO",
    ]);
    expect(labels(out)).toEqual(["PT", "SC", "RACK", "DSO"]);
  });

  it("keeps the fixed block after SC wherever SC has been moved to", () => {
    const out = orderRsChips(chips("DSO", "SC", "PT", "HBF", "TGT"), [
      "DSO",
      "SC",
      "PT",
    ]);
    expect(labels(out)).toEqual(["DSO", "SC", "HBF", "TGT", "PT"]);
  });

  it("keeps the fixed block after SC even when SC is hidden from the chips", () => {
    const out = orderRsChips(chips("DSO", "PT", "V1F"), ["DSO", "SC", "PT"]);
    expect(labels(out)).toEqual(["DSO", "V1F", "PT"]);
  });

  it("leads with the fixed block when there is no SC shortcut", () => {
    const out = orderRsChips(chips("DSO", "TGT", "HBF"), ["DSO"]);
    expect(labels(out)).toEqual(["HBF", "TGT", "DSO"]);
  });

  it("orders vehicles numerically, full before short, beyond V8 too", () => {
    const out = orderRsChips(
      chips("V10", "V2", "V10F", "V1", "V2F", "V1F", "V9F"),
      ["SC"]
    );
    expect(labels(out)).toEqual([
      "V1F",
      "V1",
      "V2F",
      "V2",
      "V9F",
      "V10F",
      "V10",
    ]);
  });

  it("puts chips the list doesn't know about last, in their given order", () => {
    const out = orderRsChips(chips("ZZ", "SC", "AA"), ["SC"]);
    expect(labels(out)).toEqual(["SC", "ZZ", "AA"]);
  });

  it("is case-insensitive on triggers", () => {
    const out = orderRsChips(chips("pt", "sc"), ["sc", "pt"]);
    expect(labels(out)).toEqual(["sc", "pt"]);
  });

  it("does not change the chips it is given", () => {
    const input = chips("PT", "SC");
    orderRsChips(input, ["SC", "PT"]);
    expect(labels(input)).toEqual(["PT", "SC"]);
  });
});

describe("fixedChipRank", () => {
  it("knows the target chips and nothing else", () => {
    for (const l of ["HBF", "V1F", "V1", "V8F", "V8", "TGT", "HB"])
      expect(fixedChipRank(l)).not.toBeNull();
    for (const l of ["SC", "DSO", "VEH", "RACK", "DEP", "ARR", "#1"])
      expect(fixedChipRank(l)).toBeNull();
  });
});

describe("initialShortcutOrder", () => {
  it("starts in the order the chips used to appear, then A to Z", () => {
    const out = initialShortcutOrder([
      { id: 1, trigger: "rack" },
      { id: 2, trigger: "zebra" },
      { id: 3, trigger: "sc" },
      { id: 4, trigger: "alpha" },
      { id: 5, trigger: "dso" },
      { id: 6, trigger: "d" },
    ]);
    const byId = (id: number) => out.find(o => o.id === id)!.sortOrder;
    expect(byId(3)).toBe(1); // sc
    expect(byId(5)).toBe(2); // dso
    expect(byId(1)).toBe(3); // rack
    expect(out.map(o => o.sortOrder).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    // everything else follows, A to Z: alpha, d, zebra
    expect(byId(4)).toBe(4);
    expect(byId(6)).toBe(5);
    expect(byId(2)).toBe(6);
  });

  it("covers every default trigger exactly once", () => {
    expect(new Set(DEFAULT_SHORTCUT_ORDER).size).toBe(
      DEFAULT_SHORTCUT_ORDER.length
    );
  });
});
