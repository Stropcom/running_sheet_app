import { describe, expect, it } from "vitest";
import { ownerAccountProblem } from "@shared/commandFeatures";

const owner = { cin: "459", role: "admin" };
const otherAdmin = { cin: "EA12", role: "admin" };

describe("the owner's account is protected", () => {
  it("lets the owner change their own account and give out their own CIN", () => {
    expect(ownerAccountProblem(owner, owner, "459")).toBeNull();
    expect(ownerAccountProblem(owner, owner, "999")).toBeNull();
  });

  it("stops any other admin changing the owner's account", () => {
    expect(ownerAccountProblem(otherAdmin, owner)).toMatch(/owner/i);
    expect(ownerAccountProblem(otherAdmin, owner, "ZZZ")).toMatch(/owner/i);
    expect(ownerAccountProblem(otherAdmin, { cin: " 459 " })).toMatch(/owner/i);
  });

  it("stops any other admin taking the owner's CIN, new or existing user", () => {
    expect(ownerAccountProblem(otherAdmin, undefined, "459")).toMatch(
      /reserved/i
    );
    expect(ownerAccountProblem(otherAdmin, { cin: "EB9" }, " 459 ")).toMatch(
      /reserved/i
    );
  });

  it("does not get in the way of ordinary changes", () => {
    expect(ownerAccountProblem(otherAdmin, { cin: "EB9" }, "EB10")).toBeNull();
    expect(ownerAccountProblem(otherAdmin, { cin: "EB9" })).toBeNull();
    expect(ownerAccountProblem(otherAdmin, undefined, undefined)).toBeNull();
  });

  it("a member or observer with CIN 459 is not the owner (the owner is an admin)", () => {
    expect(ownerAccountProblem({ cin: "459", role: "member" }, owner)).toMatch(
      /owner/i
    );
  });
});
