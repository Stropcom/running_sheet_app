import { describe, expect, it } from "vitest";
import {
  canAdministerPasskey,
  canSeePasskeyPerson,
  decidePasswordSignIn,
  looksLikeCode,
  normaliseCode,
  formatCode,
  passkeyStatus,
  warningText,
  type PasskeyAccount,
  type PasskeyPerson,
  type PasskeySettings,
} from "@shared/passkeyRules";

const on: PasskeySettings = { requireAll: true, maxPasswordSignIns: 3 };
const off: PasskeySettings = { requireAll: false, maxPasswordSignIns: 3 };
const acct = (o: Partial<PasskeyAccount> = {}): PasskeyAccount => ({
  exempt: false,
  passwordSignIns: 0,
  locked: false,
  deviceCount: 0,
  ...o,
});

describe("decidePasswordSignIn", () => {
  it("lets everyone straight in while the requirement is off", () => {
    expect(
      decidePasswordSignIn(off, acct({ passwordSignIns: 99, locked: true }))
    ).toEqual({ kind: "allow" });
    expect(decidePasswordSignIn(off, acct({ deviceCount: 2 }))).toEqual({
      kind: "allow",
    });
  });

  it("counts down 2, 1, 0 left and locks on the fourth", () => {
    expect(decidePasswordSignIn(on, acct({ passwordSignIns: 0 }))).toEqual({
      kind: "allow_warn",
      left: 2,
    });
    expect(decidePasswordSignIn(on, acct({ passwordSignIns: 1 }))).toEqual({
      kind: "allow_warn",
      left: 1,
    });
    expect(decidePasswordSignIn(on, acct({ passwordSignIns: 2 }))).toEqual({
      kind: "allow_warn",
      left: 0,
    });
    expect(decidePasswordSignIn(on, acct({ passwordSignIns: 3 }))).toEqual({
      kind: "lock",
    });
  });

  it("a locked account stays locked", () => {
    expect(decidePasswordSignIn(on, acct({ locked: true }))).toEqual({
      kind: "lock",
    });
  });

  it("a person with a passkey no longer gets in on a password alone", () => {
    expect(decidePasswordSignIn(on, acct({ deviceCount: 1 }))).toEqual({
      kind: "refuse_has_passkey",
    });
    expect(
      decidePasswordSignIn(on, acct({ deviceCount: 1, locked: true }))
    ).toEqual({ kind: "refuse_has_passkey" });
  });

  it("an exempt account is never affected", () => {
    expect(
      decidePasswordSignIn(
        on,
        acct({ exempt: true, passwordSignIns: 50, locked: true })
      )
    ).toEqual({ kind: "allow" });
  });

  it("honours a different allowance", () => {
    const five = { requireAll: true, maxPasswordSignIns: 5 };
    expect(decidePasswordSignIn(five, acct({ passwordSignIns: 3 }))).toEqual({
      kind: "allow_warn",
      left: 1,
    });
    expect(decidePasswordSignIn(five, acct({ passwordSignIns: 5 }))).toEqual({
      kind: "lock",
    });
  });
});

describe("passkeyStatus and warningText", () => {
  it("describes each state", () => {
    expect(passkeyStatus(off, acct()).tone).toBe("off");
    expect(passkeyStatus(on, acct({ exempt: true })).tone).toBe("exempt");
    expect(passkeyStatus(on, acct({ deviceCount: 2 })).label).toBe(
      "Passkey set up · 2 devices"
    );
    expect(passkeyStatus(on, acct({ deviceCount: 1 })).label).toBe(
      "Passkey set up · 1 device"
    );
    expect(passkeyStatus(on, acct({ passwordSignIns: 1 }))).toMatchObject({
      tone: "counting",
      label: "2 sign-ins left",
      left: 2,
    });
    expect(passkeyStatus(on, acct({ passwordSignIns: 2 })).label).toBe(
      "1 sign-in left"
    );
    expect(passkeyStatus(on, acct({ passwordSignIns: 3 }))).toMatchObject({
      tone: "locked",
      label: "Locks on next sign-in",
    });
    expect(passkeyStatus(on, acct({ locked: true })).label).toBe("Locked out");
  });

  it("words the warning", () => {
    expect(warningText(2)).toContain("2 sign-ins left");
    expect(warningText(1)).toContain("1 sign-in left");
    expect(warningText(0)).toContain("last sign-in");
  });
});

const person = (o: Partial<PasskeyPerson>): PasskeyPerson => ({
  id: 1,
  cin: "100",
  role: "member",
  command: "WESTERN",
  allRegions: false,
  ...o,
});
const owner = person({
  id: 459,
  cin: "459",
  role: "admin",
  command: "WESTERN",
  allRegions: true,
});

describe("who may administer whose passkey", () => {
  const adminW = person({ id: 2, role: "admin", cin: "612" });
  const adminW2 = person({ id: 3, role: "admin", cin: "620" });
  const officerW = person({ id: 4, cin: "484" });
  const adminN = person({
    id: 5,
    role: "admin",
    cin: "701",
    command: "NORTHERN",
  });
  const officerN = person({ id: 6, cin: "715", command: "NORTHERN" });

  it("an admin acts inside their own Command, including on other admins", () => {
    expect(canAdministerPasskey(adminW, officerW)).toBe(true);
    expect(canAdministerPasskey(adminW, adminW2)).toBe(true);
  });
  it("not across Commands", () => {
    expect(canAdministerPasskey(adminW, officerN)).toBe(false);
    expect(canAdministerPasskey(adminW, adminN)).toBe(false);
  });
  it("nobody approves themselves", () => {
    expect(canAdministerPasskey(adminW, adminW)).toBe(false);
    expect(canAdministerPasskey(owner, owner)).toBe(false);
  });
  it("only the owner (or an all-region admin) acts everywhere, and nobody acts on the owner", () => {
    expect(canAdministerPasskey(owner, officerN)).toBe(true);
    expect(
      canAdministerPasskey(
        person({ id: 9, role: "admin", allRegions: true }),
        officerN
      )
    ).toBe(true);
    expect(canAdministerPasskey(adminW, owner)).toBe(false);
    expect(
      canAdministerPasskey(
        person({ id: 9, role: "admin", allRegions: true }),
        owner
      )
    ).toBe(false);
  });
  it("non-admins administer nobody", () => {
    expect(canAdministerPasskey(officerW, person({ id: 7 }))).toBe(false);
    expect(canSeePasskeyPerson(officerW, officerW)).toBe(false);
  });
  it("an admin sees themselves and their region, not other Commands", () => {
    expect(canSeePasskeyPerson(adminW, adminW)).toBe(true);
    expect(canSeePasskeyPerson(adminW, officerW)).toBe(true);
    expect(canSeePasskeyPerson(adminW, officerN)).toBe(false);
    expect(canSeePasskeyPerson(adminW, owner)).toBe(false);
  });
});

describe("one-time codes", () => {
  it("normalises and formats", () => {
    expect(normaliseCode("k7qm-4txd")).toBe("K7QM4TXD");
    expect(formatCode("K7QM4TXD")).toBe("K7QM-4TXD");
  });
  it("recognises something that could be a code", () => {
    expect(looksLikeCode("K7QM-4TXD")).toBe(true);
    expect(looksLikeCode("k7qm 4txd")).toBe(true);
    expect(looksLikeCode("K7QM-4TX")).toBe(false);
    expect(looksLikeCode("K7QM-4TXO")).toBe(false); // O is not in the alphabet
  });
});
