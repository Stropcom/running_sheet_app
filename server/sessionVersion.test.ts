import { beforeAll, describe, expect, it, vi } from "vitest";

// A sign-in carries the person's session number (users.sessionVersion). These
// check the token round trip; the "ended when the number moves on" rule sits in
// sdk.authenticateRequest (checked end to end against a real database).
let sdk: typeof import("./_core/sdk").sdk;
beforeAll(async () => {
  vi.stubEnv("JWT_SECRET", "test-secret-test-secret-test-secret-00");
  vi.stubEnv("VITE_APP_ID", "test-app");
  vi.resetModules();
  sdk = (await import("./_core/sdk")).sdk;
});

describe("sign-in tokens carry the session number", () => {
  it("round-trips the number it was issued with", async () => {
    const token = await sdk.createSessionToken("alice", {
      name: "Alice",
      sessionVersion: 3,
    });
    expect(await sdk.verifySession(token)).toMatchObject({
      openId: "alice",
      sessionVersion: 3,
    });
  });

  it("counts a token without a number (issued before this existed) as 0", async () => {
    const token = await sdk.signSession({
      openId: "bob",
      appId: "test-app",
      name: "Bob",
    });
    expect((await sdk.verifySession(token))?.sessionVersion).toBe(0);
    const plain = await sdk.createSessionToken("bob", { name: "Bob" });
    expect((await sdk.verifySession(plain))?.sessionVersion).toBe(0);
  });
});
