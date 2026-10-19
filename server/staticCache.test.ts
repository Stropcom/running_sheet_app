import { describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { LONG_CACHE, REVALIDATE, staticCacheControl } from "./staticCache";

describe("staticCacheControl", () => {
  it("caches hashed build files for a year", () => {
    for (const f of [
      "assets/index-BjK0Kazv.js",
      "assets/index-C8-BI_0e.css",
      "assets/pdf-CKy0U86V.js",
      "assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm",
      "/assets/index-BjK0Kazv.js",
      "assets\\index-BjK0Kazv.js",
    ])
      expect(staticCacheControl(f), f).toBe(LONG_CACHE);
  });

  it("makes the page, service worker and manifest revalidate", () => {
    for (const f of [
      "index.html",
      "sw.js",
      "manifest.webmanifest",
      "workbox-1a2b3c4d.js",
    ])
      expect(staticCacheControl(f), f).toBe(REVALIDATE);
  });

  it("leaves everything else on the default", () => {
    for (const f of [
      "icon-192.png",
      "favicon-32.png",
      "fonts/Roboto-400.woff2",
      "models/face.onnx",
      "tactical-markers/car.svg",
      "assets/plain.js", // no hash in the name → not safe to cache for long
      "assets/sub/index-BjK0Kazv.js",
      "other/assets/index-BjK0Kazv.js",
    ])
      expect(staticCacheControl(f), f).toBeNull();
  });
});

describe("served headers", () => {
  it("sends them with express.static", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "static-"));
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets", "index-AbCdEfGh.js"), "x");
    fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(dir, "icon.png"), "x");
    const app = express();
    app.use(
      express.static(dir, {
        setHeaders: (res, filePath) => {
          const cc = staticCacheControl(path.relative(dir, filePath));
          if (cc) res.setHeader("Cache-Control", cc);
        },
      })
    );
    const server = app.listen(0);
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const get = async (p: string) =>
        (await fetch(base + p)).headers.get("cache-control");
      expect(await get("/assets/index-AbCdEfGh.js")).toBe(LONG_CACHE);
      expect(await get("/index.html")).toBe(REVALIDATE);
      expect(await get("/icon.png")).toBe("public, max-age=0");
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
