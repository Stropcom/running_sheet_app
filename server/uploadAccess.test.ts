import { describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { UPLOAD_CACHE_CONTROL, requireSignedIn } from "./uploadAccess";

async function withServer(
  signedIn: (cookie: string | undefined) => boolean,
  run: (base: string) => Promise<void>
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
  fs.mkdirSync(path.join(dir, "row-attachments"));
  fs.writeFileSync(
    path.join(dir, "row-attachments", "1_ab12cd34.jpeg"),
    "photo"
  );
  const app = express();
  app.use(
    "/local-uploads",
    requireSignedIn(async req => {
      if (!signedIn(req.headers.cookie)) throw new Error("no session");
    }),
    express.static(dir, {
      setHeaders: res => res.setHeader("Cache-Control", UPLOAD_CACHE_CONTROL),
    })
  );
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("stored files need a sign-in", () => {
  it("refuses a request with no session, and says nothing about the file", async () => {
    await withServer(
      c => c === "session=ok",
      async base => {
        const r = await fetch(
          `${base}/local-uploads/row-attachments/1_ab12cd34.jpeg`
        );
        expect(r.status).toBe(401);
        expect(r.headers.get("cache-control")).toBe("no-store");
        expect(await r.text()).toBe("Sign in required");
        // A file that doesn't exist looks the same as one that does.
        const missing = await fetch(
          `${base}/local-uploads/row-attachments/nope.jpeg`
        );
        expect(missing.status).toBe(401);
      }
    );
  });

  it("serves the file to a signed-in request, kept private on the device", async () => {
    await withServer(
      c => c === "session=ok",
      async base => {
        const r = await fetch(
          `${base}/local-uploads/row-attachments/1_ab12cd34.jpeg`,
          {
            headers: { cookie: "session=ok" },
          }
        );
        expect(r.status).toBe(200);
        expect(await r.text()).toBe("photo");
        expect(r.headers.get("cache-control")).toBe(UPLOAD_CACHE_CONTROL);
        expect(UPLOAD_CACHE_CONTROL).toContain("private");
      }
    );
  });

  it("does not let a path trick past the sign-in", async () => {
    await withServer(
      c => c === "session=ok",
      async base => {
        const r = await fetch(`${base}/local-uploads/..%2f..%2fetc%2fpasswd`);
        expect(r.status).toBe(401);
      }
    );
  });
});
