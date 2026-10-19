// Cache lifetimes for the built client files (served by serveStatic in
// server/_core/vite.ts).
//
// Only the files Vite puts in /assets/ are cached for a long time: their name
// carries a hash of their content, so a new build is always a new file name
// and a cached copy can never be out of date. Everything the browser must
// re-check on every visit — the page itself, the service worker (and the
// Workbox runtime it imports) and the manifest — is sent "no-cache" (the
// browser may keep a copy but must ask the server first, which answers 304
// when it is unchanged). Anything else (icons, fonts, models, tactical
// markers) keeps Express's default, so it is never cached beyond a
// revalidation either.

export const LONG_CACHE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache";

/** The Cache-Control header for a file served from the build folder, or null
 * to leave Express's default. `relPath` is relative to the build folder. */
export function staticCacheControl(relPath: string): string | null {
  const p = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (/^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(p))
    return LONG_CACHE;
  if (
    p === "index.html" ||
    p === "sw.js" ||
    p === "manifest.webmanifest" ||
    /^workbox-[^/]*\.js$/.test(p)
  )
    return REVALIDATE;
  return null;
}
