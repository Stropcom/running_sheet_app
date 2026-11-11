import { describe, expect, it } from "vitest";
import { stampImagerySaved } from "../shared/imageryStamp";

const me = { cin: "459", name: "Strop" };
const e = (
  cin: string,
  rowTime: string,
  saved: boolean,
  extra: Record<string, string> = {}
) => ({ cin, rowTime, type: "photo" as const, saved, ...extra });

describe("stampImagerySaved", () => {
  it("a row newly marked saved takes the officer who pressed it", () => {
    const out = stampImagerySaved(
      [e("650", "08:38 AM", false)],
      [e("650", "08:38 AM", true)],
      me
    );
    expect(out[0]).toMatchObject({
      saved: true,
      savedByCIN: "459",
      savedByName: "Strop",
    });
  });

  it("a row that was not stored yet counts as newly saved", () => {
    const out = stampImagerySaved([], [e("650", "08:38 AM", true)], me);
    expect(out[0]).toMatchObject({ savedByCIN: "459", savedByName: "Strop" });
  });

  it("a row that stays saved keeps the first officer, whoever saves next", () => {
    const out = stampImagerySaved(
      [e("650", "08:38 AM", true, { savedByCIN: "123", savedByName: "Lee" })],
      [e("650", "08:38 AM", true), e("651", "09:00 AM", false)],
      me
    );
    expect(out[0]).toMatchObject({ savedByCIN: "123", savedByName: "Lee" });
    expect(out[1]).toMatchObject({ saved: false });
    expect(out[1]).not.toHaveProperty("savedByCIN");
  });

  it("un-saving clears the name, and saving again names the new officer", () => {
    const stored = [
      e("650", "08:38 AM", true, { savedByCIN: "123", savedByName: "Lee" }),
    ];
    const unsaved = stampImagerySaved(
      stored,
      [e("650", "08:38 AM", false)],
      me
    );
    expect(unsaved[0]).not.toHaveProperty("savedByCIN");
    expect(unsaved[0]).not.toHaveProperty("savedByName");
    const again = stampImagerySaved(unsaved, [e("650", "08:38 AM", true)], me);
    expect(again[0]).toMatchObject({ savedByCIN: "459", savedByName: "Strop" });
  });

  it("a row saved before this was recorded stays without a name", () => {
    const out = stampImagerySaved(
      [e("650", "08:38 AM", true)],
      [e("650", "08:38 AM", true)],
      me
    );
    expect(out[0].saved).toBe(true);
    expect(out[0]).not.toHaveProperty("savedByCIN");
  });

  it("a name sent by the screen is never trusted", () => {
    const forged = e("650", "08:38 AM", true, {
      savedByCIN: "999",
      savedByName: "Someone",
    });
    const fresh = stampImagerySaved(
      [e("650", "08:38 AM", false)],
      [forged],
      me
    );
    expect(fresh[0]).toMatchObject({ savedByCIN: "459", savedByName: "Strop" });
    const kept = stampImagerySaved(
      [e("650", "08:38 AM", true, { savedByCIN: "123", savedByName: "Lee" })],
      [forged],
      me
    );
    expect(kept[0]).toMatchObject({ savedByCIN: "123", savedByName: "Lee" });
  });

  it("rows are matched by CIN and time, not by position", () => {
    const stored = [
      e("650", "08:38 AM", true, { savedByCIN: "123", savedByName: "Lee" }),
      e("651", "09:00 AM", false),
    ];
    const out = stampImagerySaved(
      stored,
      [e("651", "09:00 AM", true), e("650", "08:38 AM", true)],
      me
    );
    expect(out[0]).toMatchObject({ cin: "651", savedByCIN: "459" });
    expect(out[1]).toMatchObject({ cin: "650", savedByCIN: "123" });
  });
});
