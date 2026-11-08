// Who may fetch a stored photo or document.
//
// Photos, target documents and map snapshots are served as plain files from
// /local-uploads (and /manus-storage when a remote store is configured). They
// used to be handed to anyone who had the address, signed in or not — an
// address that ends up in browser history, a screenshot, a copied link or a
// server log opened the evidence from any device, forever. Both routes now
// require a signed-in session (the same check the upload route uses). The
// browser sends the login cookie by itself with <img>, <iframe> and download
// requests to the same site, so nothing on the screens changes.
//
// Signed in is the first check; the second (server/storedFileAccess.ts) is "may
// this person open the operation the file belongs to": another Command's
// Restricted operation is closed to people it was not shared with. Files are
// never deleted when a photo is removed in the app, so an address stays valid.

import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Cache-Control for a stored file. The name of every stored file is unique
 * (timestamp + random suffix) and a file is never rewritten, so a device can
 * keep its copy; "private" keeps shared caches (proxies) from holding evidence.
 * 30 days, not longer, so a copy on a lost device doesn't linger for a year. */
export const UPLOAD_CACHE_CONTROL = "private, max-age=2592000, immutable";

/** Middleware that answers 401 unless `authenticate` accepts the request. */
export function requireSignedIn(
  authenticate: (req: Request) => Promise<unknown>
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authenticate(req);
    } catch {
      res.setHeader("Cache-Control", "no-store");
      res.status(401).type("text/plain").send("Sign in required");
      return;
    }
    next();
  };
}
