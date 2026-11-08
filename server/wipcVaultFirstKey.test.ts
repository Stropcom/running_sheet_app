import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countUndecryptable, vaultEncrypt } from "./wipcVault";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const saved = process.env.WIPC_VAULT_KEY;

beforeEach(() => {
  process.env.WIPC_VAULT_KEY = KEY_A;
});
afterEach(() => {
  if (saved === undefined) delete process.env.WIPC_VAULT_KEY;
  else process.env.WIPC_VAULT_KEY = saved;
});

describe("countUndecryptable — is this the key that wrote the stored members?", () => {
  it("0 when the key opens every stored value", () => {
    const stored = [vaultEncrypt("Jane Citizen"), vaultEncrypt("A. Officer")];
    expect(countUndecryptable(stored)).toBe(0);
  });
  it("counts the values a mistyped key cannot open", () => {
    const stored = [vaultEncrypt("Jane Citizen"), vaultEncrypt("A. Officer")];
    process.env.WIPC_VAULT_KEY = KEY_B;
    expect(countUndecryptable(stored)).toBe(2);
  });
  it("nothing stored yet: 0, so the very first key can be recorded", () => {
    expect(countUndecryptable([])).toBe(0);
    expect(countUndecryptable(["", null, undefined])).toBe(0);
  });
  it("a value that is not in the vault format counts as unreadable", () => {
    expect(countUndecryptable(["plain text"])).toBe(1);
  });
});
