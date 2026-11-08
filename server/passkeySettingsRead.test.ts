import { beforeEach, describe, expect, it, vi } from "vitest";

// What loadPasskeySettings does when the settings cannot be read: it must not
// quietly report "requirement off" (a password-only sign-in would go through
// for someone who needs a passkey).
type Rows = Array<{ requireAll: boolean; maxPasswordSignIns: number }>;
let mode: "rows" | "error" | "nodb" = "rows";
let rows: Rows = [];
vi.mock("./db", () => ({
  createAuditLog: vi.fn(),
  getDb: async () =>
    mode === "nodb"
      ? null
      : {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => {
                  if (mode === "error") throw new Error("table unreadable");
                  return rows;
                },
              }),
            }),
          }),
        },
}));

import { invalidatePasskeySettings, loadPasskeySettings } from "./passkey";

describe("loading the passkey settings", () => {
  beforeEach(() => {
    invalidatePasskeySettings();
    mode = "rows";
    rows = [];
  });

  it("with no saved row, the requirement is off", async () => {
    expect(await loadPasskeySettings()).toMatchObject({ requireAll: false });
  });

  it("reads the saved switch", async () => {
    rows = [{ requireAll: true, maxPasswordSignIns: 3 }];
    expect(await loadPasskeySettings()).toMatchObject({
      requireAll: true,
      maxPasswordSignIns: 3,
    });
  });

  it("refuses, rather than switching off, when the settings cannot be read", async () => {
    rows = [{ requireAll: true, maxPasswordSignIns: 3 }];
    await loadPasskeySettings(); // cached as ON
    invalidatePasskeySettings();
    mode = "error";
    await expect(loadPasskeySettings()).rejects.toThrow(/unavailable/);
    mode = "nodb";
    await expect(loadPasskeySettings()).rejects.toThrow(/unavailable/);
  });

  it("does not remember a failed read", async () => {
    mode = "error";
    await expect(loadPasskeySettings()).rejects.toThrow();
    mode = "rows";
    rows = [{ requireAll: true, maxPasswordSignIns: 2 }];
    expect(await loadPasskeySettings()).toMatchObject({ requireAll: true });
  });
});
