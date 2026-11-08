/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// self.__WB_MANIFEST is replaced by Workbox's injectManifest step at build time.
// The cast via (self as unknown) prevents TypeScript from complaining while keeping
// the literal string intact in the compiled output so Workbox can find it.
precacheAndRoute((self as unknown as { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }).__WB_MANIFEST);
cleanupOutdatedCaches();

// registerType: "autoUpdate" (see main.tsx) relies on the service worker
// activating itself as soon as a new version installs — the generateSW
// strategy injects this automatically, but injectManifest (needed here for
// the custom precache/activate logic) does not, so without this a new build
// installs and sits in "waiting" forever, never taking over, no matter how
// the page is reloaded. skipWaiting() here is what lets it activate
// immediately.
self.skipWaiting();

// Take control of any already-open tabs as soon as this version activates,
// not just future navigations.
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

// Skip waiting so updates activate immediately
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Opening any page of the installed app with no connection (a reload on a
// deep link, or opening the app on a phone with no signal) used to fail,
// because only "/" and "/index.html" were answered from the cache. Every other
// page load is tried on the network first as always, and only if that fails
// is the cached app shell served — it then works out the page from the address
// like any other visit. API calls, uploads and files are never answered this
// way.
self.addEventListener("fetch", (event: FetchEvent) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  const path = new URL(req.url).pathname;
  if (path === "/" || path === "/index.html") return; // already precached
  if (
    path.startsWith("/api/") ||
    path.startsWith("/local-uploads/") ||
    path.startsWith("/manus-storage/")
  )
    return;
  event.respondWith(
    fetch(req).catch(async () => {
      const shell = await matchPrecache("/index.html");
      return shell ?? Response.error();
    })
  );
});
