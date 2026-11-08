import { beforeEach, describe, expect, it } from "vitest";
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  consumeLoginAttempt,
  resetLoginAttempts,
} from "./loginAttempts";

describe("password sign-in attempts", () => {
  beforeEach(resetLoginAttempts);

  it("allows 20 in a window and refuses the 21st, however they arrive", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++)
      expect(consumeLoginAttempt("1.2.3.4", 1000)).toBe(true);
    expect(consumeLoginAttempt("1.2.3.4", 1000)).toBe(false);
  });

  it("counts addresses separately", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) consumeLoginAttempt("a", 0);
    expect(consumeLoginAttempt("a", 0)).toBe(false);
    expect(consumeLoginAttempt("b", 0)).toBe(true);
  });

  it("lets attempts through again once the window has passed", () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) consumeLoginAttempt("a", 0);
    expect(consumeLoginAttempt("a", LOGIN_WINDOW_MS - 1)).toBe(false);
    expect(consumeLoginAttempt("a", LOGIN_WINDOW_MS)).toBe(true);
  });
});
