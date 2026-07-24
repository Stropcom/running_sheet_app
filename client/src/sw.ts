/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// self.__WB_MANIFEST is replaced by Workbox's injectManifest step at build time.
// The cast via (self as unknown) prevents TypeScript from complaining while keeping
// the literal string intact in the compiled output so Workbox can find it.
precacheAndRoute((self as unknown as { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }).__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Push notification handler ─────────────────────────────────────────────────
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string; icon?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "RunLog", body: event.data?.text() ?? "" };
  }

  const title = data.title ?? "RunLog";
  const options: NotificationOptions = {
    body: data.body ?? "",
    icon: data.icon ?? "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url ?? "/" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click handler ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              (client as WindowClient).navigate(url);
            }
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// Skip waiting so updates activate immediately
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
