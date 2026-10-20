import { describe, expect, it } from "vitest";
import {
  surveillanceSignal,
  surveillanceState,
} from "@shared/surveillanceState";

const TEAM = ["650", "459", "484", "492", "652"];
const row = (
  id: number,
  observation: string,
  members: string[],
  time = "03:00 PM"
) => ({ id, observation, members, time });

describe("surveillanceSignal", () => {
  it("reads ceased and commenced at the start of a row or a line", () => {
    expect(
      surveillanceSignal("Surveillance ceased in the vicinity of X.")
    ).toBe("ceased");
    expect(
      surveillanceSignal("  surveillance COMMENCED at 5 Smith Street")
    ).toBe("commenced");
    expect(surveillanceSignal("HOGAN left.\nSurveillance ceased.")).toBe(
      "ceased"
    );
  });
  it("ignores the words inside a sentence, and rows with neither", () => {
    expect(
      surveillanceSignal("Team advised surveillance ceased at 3.")
    ).toBeNull();
    expect(surveillanceSignal("HOGAN entered 5 Smith Street.")).toBeNull();
    expect(surveillanceSignal(null)).toBeNull();
  });
});

describe("surveillanceState — each member must cease", () => {
  const live = row(
    1,
    "Surveillance commenced at 5 Smith Street.",
    TEAM,
    "07:00 AM"
  );

  it("is live with nobody having ceased", () => {
    expect(surveillanceState([live], TEAM).ended).toBe(false);
  });

  it("stays live while one officer ceases and the rest carry on", () => {
    const s = surveillanceState(
      [live, row(2, "Surveillance ceased.", ["484"])],
      TEAM
    );
    expect(s.ended).toBe(false);
    expect(s.stillOn.sort()).toEqual(["459", "492", "650", "652"]);
  });

  it("ends when the rest have ceased too, and says by which row", () => {
    const s = surveillanceState(
      [
        live,
        row(2, "Surveillance ceased.", ["484"], "02:10 PM"),
        row(
          3,
          "Surveillance ceased in the vicinity of Rockingham Centre.",
          ["650", "459", "492", "652"],
          "03:40 PM"
        ),
      ],
      TEAM
    );
    expect(s.ended).toBe(true);
    expect(s.endedByRowId).toBe(3);
    expect(s.endedAtTime).toBe("03:40 PM");
    expect(s.stillOn).toEqual([]);
  });

  it("goes live again when anyone commences", () => {
    const ended = [live, row(2, "Surveillance ceased.", TEAM, "03:40 PM")];
    expect(surveillanceState(ended, TEAM).ended).toBe(true);
    const resumed = surveillanceState(
      [
        ...ended,
        row(
          3,
          "Surveillance commenced at 5 Smith Street.",
          ["484"],
          "04:30 PM"
        ),
      ],
      TEAM
    );
    expect(resumed.ended).toBe(false);
    expect(resumed.stillOn).toEqual(["484"]);
  });

  it("an ordinary later row does not bring it back", () => {
    const s = surveillanceState(
      [
        live,
        row(2, "Surveillance ceased.", TEAM, "03:40 PM"),
        row(3, "PHOTOGRAPH/S TAKEN.", ["484"], "03:50 PM"),
      ],
      TEAM
    );
    expect(s.ended).toBe(true);
    expect(s.endedByRowId).toBe(2);
  });

  it("a team member who never writes a row must still cease", () => {
    const s = surveillanceState(
      [live, row(2, "Surveillance ceased.", ["650", "459", "484", "492"])],
      TEAM
    );
    expect(s.ended).toBe(false);
    expect(s.stillOn).toEqual(["652"]);
  });

  it("counts a CIN that is on a row but not on the roster", () => {
    const s = surveillanceState(
      [row(1, "HOGAN left.", ["999"]), row(2, "Surveillance ceased.", TEAM)],
      TEAM
    );
    expect(s.ended).toBe(false);
    expect(s.stillOn).toEqual(["999"]);
  });

  it("a ceased row with nobody on it changes nothing, and an empty sheet is live", () => {
    expect(
      surveillanceState([live, row(2, "Surveillance ceased.", [])], TEAM).ended
    ).toBe(false);
    expect(surveillanceState([], []).ended).toBe(false);
  });
});
