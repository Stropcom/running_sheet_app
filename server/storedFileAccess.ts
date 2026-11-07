// Who may fetch a stored photo or document (see shared/operationAccess.ts,
// canOpenStoredFile, for the rule). The routes in server/storage.ts and
// server/_core/storageProxy.ts run this after sign-in.
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { rowAttachments } from "../drizzle/schema";
import {
  canOpenStoredFile,
  type StoredFileOwner,
} from "@shared/operationAccess";
import { parseStoredFileKey, storedFileKey } from "@shared/storedFileKey";
import { getDb } from "./db/core";
import {
  loadAccessData,
  operationsOfFileOwners,
  toAccessUser,
} from "./operationAccess";

const OWNER_TTL_MS = 60_000;
const OWNER_CACHE_MAX = 5000;
const ownerCache = new Map<string, { at: number; owner: StoredFileOwner }>();

/** Who a stored file belongs to. Throws when the database cannot be read (the
 * caller then refuses the request rather than guessing). */
export async function ownerOfStoredFile(key: string): Promise<StoredFileOwner> {
  const hit = ownerCache.get(key);
  if (hit && Date.now() - hit.at < OWNER_TTL_MS) return hit.owner;
  const parsed = parseStoredFileKey(key);
  let owner: StoredFileOwner = null;
  if (parsed.kind === "open") owner = { open: true };
  else if (parsed.kind === "sheet")
    owner = { ops: await operationsOfFileOwners("sheet", parsed.id) };
  else if (parsed.kind === "operation") owner = { ops: [parsed.id] };
  else if (parsed.kind === "target")
    owner = { ops: await operationsOfFileOwners("target", parsed.id) };
  else {
    // An older name: find it among the photos.
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [row] = await db
      .select({ operationId: rowAttachments.operationId })
      .from(rowAttachments)
      .where(and(eq(rowAttachments.key, key), isNull(rowAttachments.deletedAt)))
      .limit(1);
    owner = row ? { ops: [row.operationId] } : null;
  }
  if (ownerCache.size >= OWNER_CACHE_MAX) ownerCache.clear();
  ownerCache.set(key, { at: Date.now(), owner });
  return owner;
}

/**
 * Express middleware: signed in (401 otherwise) and allowed to open this file
 * (403 otherwise). `keyOf` reads the stored key from the request.
 */
export function requireFileAccess(
  authenticate: (req: Request) => Promise<{
    id: number;
    command: Parameters<typeof toAccessUser>[0]["command"];
    role: string;
    allRegions: boolean;
  }>,
  keyOf: (req: Request) => string
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    let user;
    try {
      user = await authenticate(req);
    } catch {
      res.setHeader("Cache-Control", "no-store");
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    const key = storedFileKey(keyOf(req));
    if (!key) {
      res.setHeader("Cache-Control", "no-store");
      res.status(400).type("text/plain").send("Bad file address");
      return;
    }
    try {
      const [owner, { ops, shares }] = await Promise.all([
        ownerOfStoredFile(key),
        loadAccessData(),
      ]);
      if (!canOpenStoredFile(toAccessUser(user), owner, ops, shares)) {
        res.setHeader("Cache-Control", "no-store");
        res.status(403).type("text/plain").send("No access to that file");
        return;
      }
    } catch (err) {
      console.error("[files] access check failed:", err);
      res.setHeader("Cache-Control", "no-store");
      res.status(503).type("text/plain").send("Try again shortly");
      return;
    }
    next();
  };
}
