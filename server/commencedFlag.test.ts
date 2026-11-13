import { describe, expect, it } from "vitest";
import { surveillanceState } from "@shared/surveillanceState";
import {
  commencedPosition,
  targetEmoji,
  type TargetPosition,
} from "@shared/targetPosition";

const TEAM = ["650", "459"];
const row = (
  id: number,
  observation: string,
  members: string[],
  time: string
) => ({ id, observation, members, time });
const COMMENCED =
  "Surveillance commenced in the vicinity of Dental Boutique Perth, 634 Murray Street, WEST PERTH WA (Dental Boutique Perth).";

describe("surveillanceState — where and when it commenced", () => {
  it("takes the first commenced row's time and place", () => {
    const s = surveillanceState(
      [
        row(1, COMMENCED, TEAM, "08:39 AM"),
        row(
          2,
          "Surveillance commenced at 5 Smith Street.",
          ["650"],
          "09:00 AM"
        ),
      ],
      TEAM
    );
    expect(s.commencedByRowId).toBe(1);
    expect(s.commencedAtTime).toBe("08:39 AM");
    expect(s.commencedPlace).toContain("Dental Boutique Perth");
  });
  it("is the new start after everyone ceased and commenced again", () => {
    const s = surveillanceState(
      [
        row(1, COMMENCED, TEAM, "08:39 AM"),
        row(2, "Surveillance ceased in the vicinity of X.", TEAM, "10:00 AM"),
        row(
          3,
          "Surveillance commenced in the vicinity of 5 Smith Street.",
          TEAM,
          "11:00 AM"
        ),
      ],
      TEAM
    );
    expect(s.commencedByRowId).toBe(3);
    expect(s.commencedAtTime).toBe("11:00 AM");
    expect(s.commencedPlace).toBe("5 Smith Street");
  });
  it("is empty once it has ended, and when no row says commenced", () => {
    const ended = surveillanceState(
      [
        row(1, COMMENCED, TEAM, "08:39 AM"),
        row(2, "Surveillance ceased.", TEAM, "10:00 AM"),
      ],
      TEAM
    );
    expect(ended.commencedByRowId).toBeNull();
    expect(ended.commencedPlace).toBeNull();
    const none = surveillanceState(
      [row(1, "HOGAN walked.", TEAM, "8:00")],
      TEAM
    );
    expect(none.commencedByRowId).toBeNull();
  });
});

describe("commencedPosition — the Commenced flag", () => {
  const live = surveillanceState([row(1, COMMENCED, TEAM, "08:39 AM")], TEAM);
  it("flags the commenced place with 'Commenced <time>'", () => {
    const p = commencedPosition(null, live);
    expect(p).toMatchObject({
      place: "Dental Boutique Perth",
      state: "commenced",
      label: "Commenced 08:39 AM",
      rowId: 1,
    });
    expect(targetEmoji("commenced")).toBe("▶️");
  });
  it("gives way to any logged position", () => {
    const where: TargetPosition = {
      place: "Little Mia Cafe",
      state: "inside",
      label: "inside",
      people: ["SANTOS"],
      rowId: 2,
    };
    expect(commencedPosition(where, live)).toBeNull();
  });
  it("is not shown once ended, with no place written, or with no surveillance info", () => {
    const ended = surveillanceState(
      [
        row(1, COMMENCED, TEAM, "08:39 AM"),
        row(2, "Surveillance ceased.", TEAM, "10:00 AM"),
      ],
      TEAM
    );
    expect(commencedPosition(null, ended)).toBeNull();
    const bare = surveillanceState(
      [row(1, "Surveillance commenced in the vicinity of ", TEAM, "08:39 AM")],
      TEAM
    );
    expect(commencedPosition(null, bare)).toBeNull();
    expect(commencedPosition(null, null)).toBeNull();
  });
  it("says just 'Commenced' when the row has no time", () => {
    const s = surveillanceState([row(1, COMMENCED, TEAM, "")], TEAM);
    expect(
      commencedPosition(null, { ...s, commencedAtTime: null })?.label
    ).toBe("Commenced");
  });
});
