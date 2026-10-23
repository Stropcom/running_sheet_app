import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { pingDatabase, registerHealthRoute } from "./healthz";

afterEach(() => vi.clearAllMocks());

describe("pingDatabase", () => {
  it("is true when the database answers", async () => {
    vi.mocked(getDb).mockResolvedValue({} as never);
    expect(await pingDatabase(200)).toBe(true);
  });

  it("is false when the database cannot be reached", async () => {
    vi.mocked(getDb).mockResolvedValue(null as never);
    expect(await pingDatabase(200)).toBe(false);
  });

  it("is false, not an error, when the lookup throws", async () => {
    vi.mocked(getDb).mockRejectedValue(new Error("connection refused"));
    expect(await pingDatabase(200)).toBe(false);
  });

  it("is false when the database is too slow to answer", async () => {
    vi.mocked(getDb).mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    expect(await pingDatabase(50)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

async function withServer(
  ping: () => Promise<boolean>,
  cacheMs: number,
  now: () => number,
  fn: (get: () => Promise<Response>) => Promise<void>
) {
  const app = express();
  registerHealthRoute(app, ping, cacheMs, now);
  // What the real app does after it: serve its page for any other address.
  app.use((_req, res) => res.status(200).send("<html>the app</html>"));
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await fn(() => fetch(`${base}/healthz`));
  } finally {
    server.close();
  }
}

describe("GET /healthz", () => {
  it("answers 200 {ok:true} when the database is up, and nothing else", async () => {
    await withServer(
      async () => true,
      0,
      () => 0,
      async get => {
        const res = await get();
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(await res.json()).toEqual({ ok: true });
      }
    );
  });

  it("answers 503 {ok:false} when the database is down", async () => {
    await withServer(
      async () => false,
      0,
      () => 0,
      async get => {
        const res = await get();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ ok: false });
      }
    );
  });

  it("answers 503 when the check itself blows up", async () => {
    await withServer(
      async () => {
        throw new Error("boom");
      },
      0,
      () => 0,
      async get => {
        const res = await get();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ ok: false });
      }
    );
  });

  it("asks the database at most once per cache window, however many calls", async () => {
    const ping = vi.fn(async () => true);
    let t = 1000;
    await withServer(
      ping,
      5000,
      () => t,
      async get => {
        await Promise.all([get(), get(), get(), get()]);
        await get();
        expect(ping).toHaveBeenCalledTimes(1);
        t += 6000; // window over → asks again
        await get();
        expect(ping).toHaveBeenCalledTimes(2);
      }
    );
  });
});
