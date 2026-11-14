// Where the Street View and Photos panels open (shared/pipLayout.ts).
import { describe, expect, it } from "vitest";
import { defaultPipPosition, PIP_START } from "../shared/pipLayout";

const size = { width: 320, height: 240 };
const big = { width: 1100, height: 800 };

describe("defaultPipPosition", () => {
  it("opens top-left under the Follow me row when nothing else is open", () => {
    expect(defaultPipPosition({ container: big, size, others: [] })).toEqual({
      left: PIP_START.left,
      top: PIP_START.top,
    });
    expect(PIP_START).toEqual({ left: 10, top: 110 });
  });

  it("goes beside a panel that is already there: side by side across the top", () => {
    const first = { left: 10, top: 110, width: 320, height: 240 };
    expect(
      defaultPipPosition({ container: big, size, others: [first] })
    ).toEqual({ left: 340, top: 110 });
  });

  it("goes beside a panel the officer dragged elsewhere only when it is in the way", () => {
    const farAway = { left: 700, top: 500, width: 320, height: 240 };
    expect(
      defaultPipPosition({ container: big, size, others: [farAway] })
    ).toEqual({ left: 10, top: 110 });
    const wide = { left: 10, top: 110, width: 500, height: 240 };
    expect(
      defaultPipPosition({ container: big, size, others: [wide] })
    ).toEqual({ left: 520, top: 110 });
  });

  it("goes on the next row when there is no room to the right", () => {
    const first = { left: 10, top: 110, width: 320, height: 240 };
    const phone = { width: 390, height: 844 };
    expect(
      defaultPipPosition({ container: phone, size, others: [first] })
    ).toEqual({ left: 10, top: 360 });
  });

  it("an iPad held upright (820 wide) still fits two side by side", () => {
    const first = { left: 10, top: 110, width: 320, height: 240 };
    expect(
      defaultPipPosition({
        container: { width: 820, height: 1000 },
        size,
        others: [first],
      })
    ).toEqual({ left: 340, top: 110 });
  });

  it("a third panel goes after the second, or below when the row is full", () => {
    const a = { left: 10, top: 110, width: 320, height: 240 };
    const b = { left: 340, top: 110, width: 320, height: 240 };
    expect(
      defaultPipPosition({
        container: { width: 1100, height: 800 },
        size,
        others: [a, b],
      })
    ).toEqual({ left: 670, top: 110 });
    expect(
      defaultPipPosition({
        container: { width: 700, height: 800 },
        size,
        others: [a, b],
      })
    ).toEqual({ left: 10, top: 360 });
  });

  it("stays inside a container too small for it", () => {
    const tiny = defaultPipPosition({
      container: { width: 300, height: 200 },
      size,
      others: [],
    });
    expect(tiny).toEqual({ left: 8, top: 8 });
  });
});
