import { describe, expect, it } from "vitest";
import { followsVehicleMake } from "../shared/vehicleModel";
import { detectVehicleMentionTrigger } from "../client/src/lib/mentionAutocomplete";
import { checkModelBrackets } from "./sheetCheck";

const none = new Set<string>();
const typed = (text: string) => detectVehicleMentionTrigger(text, text.length, none);

describe("a model name is not bracketed as a registration", () => {
  it("leaves a model straight after its make alone", () => {
    expect(typed("A blue Mercedes Benz C200")).toBeNull();
    expect(typed("a white Toyota Hilux SR5")).toBeNull();
    expect(typed("a grey Lexus NX350h")).toBeNull();
    expect(typed("a red Toyota RAV4")).toBeNull();
  });

  it("still brackets a plate, introduced or on its own", () => {
    expect(typed("sedan, bearing WA registration 1FAB007")?.word).toBe("1FAB007");
    expect(typed("A blue Mercedes Benz C200, sedan, bearing WA registration 1FAB007")?.word).toBe("1FAB007");
    expect(typed("Vehicle 1FAB007")?.word).toBe("1FAB007");
    expect(typed("walked to 1TDM414")?.word).toBe("1TDM414");
    expect(typed("a white Toyota Hilux, rego 1ABC234")?.word).toBe("1ABC234");
  });

  it("reads the make rule on the text before the word", () => {
    expect(followsVehicleMake("a blue Mercedes Benz ")).toBe(true);
    expect(followsVehicleMake("a blue Mercedes Benz, bearing WA registration ")).toBe(false);
    expect(followsVehicleMake("walked to the ")).toBe(false);
  });
});

describe("Check Sheet — model bracketed as a registration", () => {
  const row = (observation: string) => ({ rowId: 1, timeMinutes: 433, observation });
  const bad =
    "A blue Mercedes Benz C200 (Vehicle C200), sedan, bearing WA registration 1FAB007 (Vehicle 1FAB007), park and unattended in the driveway at 9 Etwell Street.";

  it("flags it and the fix removes only the stray bracket", () => {
    const f = checkModelBrackets([row(bad)]);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe("model-bracketed-as-rego");
    expect(bad.replace(f[0].suggestedFix!.wrong, f[0].suggestedFix!.correct)).toBe(
      "A blue Mercedes Benz C200, sedan, bearing WA registration 1FAB007 (Vehicle 1FAB007), park and unattended in the driveway at 9 Etwell Street."
    );
  });

  it("leaves a real plate after a make, and a correct row, alone", () => {
    expect(checkModelBrackets([row("a white Toyota 1ABC234 (Vehicle 1ABC234) parked.")])).toEqual([]);
    expect(
      checkModelBrackets([
        row("A blue Mercedes Benz C200, sedan, bearing WA registration 1FAB007 (Vehicle 1FAB007), parked."),
      ])
    ).toEqual([]);
  });
});
