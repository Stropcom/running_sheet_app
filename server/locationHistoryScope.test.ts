import { describe, expect, it } from "vitest";
import { pointIsOnlyInHiddenOperations } from "./db/mapping";

describe("an earlier location point and the operations it was tagged with", () => {
  const hidden = new Set([3]);
  it("is kept back only when every operation it carries is hidden", () => {
    expect(pointIsOnlyInHiddenOperations("[3]", hidden)).toBe(true);
    expect(pointIsOnlyInHiddenOperations("[3,3]", hidden)).toBe(true);
    expect(pointIsOnlyInHiddenOperations("[3,1]", hidden)).toBe(false);
    expect(pointIsOnlyInHiddenOperations("[1]", hidden)).toBe(false);
  });
  it("is kept when it carries no operation, or the list cannot be read", () => {
    expect(pointIsOnlyInHiddenOperations("[]", hidden)).toBe(false);
    expect(pointIsOnlyInHiddenOperations(null, hidden)).toBe(false);
    expect(pointIsOnlyInHiddenOperations("not json", hidden)).toBe(false);
    expect(pointIsOnlyInHiddenOperations('{"a":1}', hidden)).toBe(false);
  });
});
